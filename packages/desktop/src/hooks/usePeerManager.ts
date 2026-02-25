import { useEffect, useRef, type MutableRefObject } from "react";
import { PeerManager } from "@null/core/p2p";
import { decryptMessage } from "@null/core/messaging";
import { hexToBytes } from "@null/core/crypto";
import type { EncryptedMessage } from "@null/core/crypto";
import { useApp } from "../context/AppContext.js";
import type { LocalMessage, Contact } from "../context/reducer.js";

/** Returns zero-padded 16-digit timestamp string for use in LevelDB keys */
function tsKey(ts: number): string {
  return String(ts).padStart(16, "0");
}

function msgStorageKey(contactAddress: string, ts: number, id: string): string {
  return `msg:${contactAddress}:${tsKey(ts)}:${id}`;
}

// ── Message envelope ────────────────────────────────────────────────────────
// v1 envelope bundles the sender's pubkey alongside the encrypted payload so
// recipients can decrypt even if they haven't yet added the sender as a contact.

interface MessageEnvelope {
  v: 1;
  senderPubkeyHex: string;
  msg: EncryptedMessage;
}

/** Wrap an EncryptedMessage for sending */
export function wrapEnvelope(
  encrypted: EncryptedMessage,
  senderPubkeyHex: string
): string {
  const envelope: MessageEnvelope = { v: 1, senderPubkeyHex, msg: encrypted };
  return JSON.stringify(envelope);
}

/** Parse incoming data — returns envelope fields or falls back to legacy bare EncryptedMessage */
function parseIncoming(
  raw: string
): { encrypted: EncryptedMessage; senderPubkeyHex: string | undefined } | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (parsed["v"] === 1 && parsed["msg"] != null) {
    return {
      encrypted: parsed["msg"] as EncryptedMessage,
      senderPubkeyHex: typeof parsed["senderPubkeyHex"] === "string"
        ? parsed["senderPubkeyHex"]
        : undefined,
    };
  }

  // Legacy bare EncryptedMessage (no envelope)
  return { encrypted: parsed as unknown as EncryptedMessage, senderPubkeyHex: undefined };
}

// ── Queue drain ──────────────────────────────────────────────────────────────

interface QueueEntry {
  id: string;
  encryptedPayload: string;
  recipientAddress: string;
  timestamp: number;
  attempts: number;
}

const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const QUEUE_MAX_ATTEMPTS = 10;

async function drainQueueForPeer(
  peerAddress: string,
  pm: PeerManager,
  onDelivered: (msgId: string) => void,
  onFailed: (msgId: string) => void
): Promise<void> {
  const rows = await window.nullBridge.storage.list(`queue:${peerAddress}:`);
  const now = Date.now();

  for (const row of rows) {
    let entry: QueueEntry;
    try {
      entry = JSON.parse(row.value) as QueueEntry;
    } catch {
      await window.nullBridge.storage.del(row.key);
      continue;
    }

    // Expire old entries
    if (now - entry.timestamp > QUEUE_MAX_AGE_MS) {
      await window.nullBridge.storage.del(row.key);
      onFailed(entry.id);
      continue;
    }

    // Too many attempts
    if (entry.attempts >= QUEUE_MAX_ATTEMPTS) {
      await window.nullBridge.storage.del(row.key);
      onFailed(entry.id);
      continue;
    }

    const sent = pm.sendTo(peerAddress, entry.encryptedPayload);
    if (sent) {
      await window.nullBridge.storage.del(row.key);
      onDelivered(entry.id);
    } else {
      const updated: QueueEntry = { ...entry, attempts: entry.attempts + 1 };
      await window.nullBridge.storage.put(row.key, JSON.stringify(updated));
    }
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePeerManager(): MutableRefObject<PeerManager | null> {
  const { state, dispatch, getPrivateKey } = useApp();
  const pmRef = useRef<PeerManager | null>(null);

  // Keep live refs so callbacks always see current state, not stale closures.
  const contactsRef = useRef(state.contacts);
  contactsRef.current = state.contacts;

  useEffect(() => {
    if (!state.wallet) return;

    const walletAddress = state.wallet.address;
    const pm = new PeerManager(window.nullBridge.signalingUrl, walletAddress);
    pmRef.current = pm;

    dispatch({ type: "SET_PEER_STATUS", address: walletAddress, status: "connecting" });

    // ── Peer connected: drain offline queue ──────────────────────────────────
    pm.onPeerConnected((peerAddress) => {
      dispatch({ type: "SET_PEER_STATUS", address: peerAddress, status: "connected" });

      void drainQueueForPeer(
        peerAddress,
        pm,
        (msgId) => dispatch({ type: "UPDATE_MESSAGE_STATUS", contactAddress: peerAddress, messageId: msgId, status: "delivered" }),
        (msgId) => dispatch({ type: "UPDATE_MESSAGE_STATUS", contactAddress: peerAddress, messageId: msgId, status: "failed" })
      );
    });

    // ── Incoming message ─────────────────────────────────────────────────────
    pm.onMessage(async (fromAddress, rawData) => {
      const privKey = getPrivateKey();
      if (!privKey) return;

      const parsed = parseIncoming(rawData);
      if (!parsed) return;

      const { encrypted, senderPubkeyHex } = parsed;

      let contact: Contact | undefined = contactsRef.current[fromAddress];

      // Unknown sender — if they included their pubkey in the envelope,
      // surface a contact request and still decrypt so the message isn't lost.
      if (!contact && senderPubkeyHex) {
        dispatch({ type: "ADD_PENDING_REQUEST", address: fromAddress, pubkeyHex: senderPubkeyHex });
        // Use their embedded pubkey to decrypt
        contact = { address: fromAddress, pubkeyHex: senderPubkeyHex };
      }

      if (!contact) return; // No pubkey available — can't decrypt, drop

      let content: string;
      try {
        content = await decryptMessage({
          message: encrypted,
          recipientPrivKey: privKey,
          senderPubKey: hexToBytes(contact.pubkeyHex),
        });
      } catch {
        return; // Tampered or wrong key
      }

      const local: LocalMessage = {
        id: encrypted.id,
        fromAddress,
        toAddress: walletAddress,
        content,
        timestamp: encrypted.timestamp,
        status: "delivered",
      };

      dispatch({ type: "RECEIVE_MESSAGE", contactAddress: fromAddress, message: local });

      // OS notification when window is not focused
      if (document.hidden && typeof Notification !== "undefined") {
        const name =
          contactsRef.current[fromAddress]?.nickname ??
          `${fromAddress.slice(0, 6)}…${fromAddress.slice(-4)}`;
        new Notification(`Null — ${name}`, { body: content, silent: false });
      }

      // Persist to local storage
      void window.nullBridge.storage.put(
        msgStorageKey(fromAddress, encrypted.timestamp, encrypted.id),
        JSON.stringify(local)
      );
    });

    void pm.connect();

    return () => {
      pm.closeAll();
      pmRef.current = null;
    };
  }, [state.wallet?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  return pmRef;
}

// ── Re-export helpers so ConversationPage can use them ─────────────────────
export { msgStorageKey };
