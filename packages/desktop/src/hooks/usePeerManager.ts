import { useEffect, useRef, type MutableRefObject } from "react";
import { PeerManager } from "@null/core/p2p";
import { decryptMessage } from "@null/core/messaging";
import { hexToBytes } from "@null/core/crypto";
import type { EncryptedMessage } from "@null/core/crypto";
import {
  parseFileWireMessage,
  deriveFileKey,
  decryptFileChunk,
  CHUNK_SIZE,
  type FileMetaChunk,
  parseGroupWireMessage,
  decryptGroupKey,
  decryptGroupMessage,
  type Group,
  type GroupWireMessage,
} from "@null/core/messaging";
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

// ── File transfer buffer ──────────────────────────────────────────────────────

interface FileBuffer {
  meta: FileMetaChunk;
  chunks: Map<number, Uint8Array>;
  messageId: string;
  fromAddress: string;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePeerManager(): MutableRefObject<PeerManager | null> {
  const { state, dispatch, getPrivateKey } = useApp();
  const pmRef = useRef<PeerManager | null>(null);

  // Keep live refs so callbacks always see current state, not stale closures.
  const contactsRef = useRef(state.contacts);
  contactsRef.current = state.contacts;

  const groupsRef = useRef(state.groups);
  groupsRef.current = state.groups;

  // In-memory file transfer buffers (cleared on unmount)
  const fileBuffers = useRef(new Map<string, FileBuffer>());

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

    // ── Group message handler ─────────────────────────────────────────────────

    async function handleGroupMessage(
      msg: GroupWireMessage,
      fromAddress: string,
      privKey: Uint8Array
    ): Promise<void> {
      if (msg.type === "group-key") {
        const sender: Contact | undefined = contactsRef.current[fromAddress];
        if (!sender) return;
        let groupKeyHex: string;
        try {
          groupKeyHex = await decryptGroupKey(
            msg.encryptedKeyIv,
            msg.encryptedKeyCiphertext,
            privKey,
            hexToBytes(sender.pubkeyHex)
          );
        } catch {
          return;
        }
        const group: Group = {
          id: msg.groupId,
          name: msg.groupName,
          adminAddress: msg.adminAddress,
          memberAddresses: msg.memberAddresses,
          createdAt: msg.createdAt,
          groupKeyHex,
        };
        await window.nullBridge.storage.put(`group:${group.id}`, JSON.stringify(group));
        dispatch({ type: "ADD_GROUP", group });
        if (document.hidden && typeof Notification !== "undefined") {
          new Notification("Null — New Group", {
            body: `You've been added to "${msg.groupName}"`,
            silent: false,
          });
        }
      } else if (msg.type === "group-msg") {
        const group = groupsRef.current[msg.groupId];
        if (!group) return;
        let content: string;
        try {
          content = await decryptGroupMessage(msg.ciphertext, msg.iv, group.groupKeyHex);
        } catch {
          return;
        }
        const local: LocalMessage = {
          id: msg.messageId,
          fromAddress: msg.fromAddress,
          toAddress: msg.groupId,
          content,
          timestamp: msg.timestamp,
          status: "delivered",
          ...(msg.expiresIn !== undefined ? { expiresAt: msg.timestamp + msg.expiresIn } : {}),
        };
        dispatch({ type: "RECEIVE_GROUP_MESSAGE", groupId: msg.groupId, message: local });
        void window.nullBridge.storage.put(
          `gmsg:${msg.groupId}:${tsKey(msg.timestamp)}:${msg.messageId}`,
          JSON.stringify(local)
        );
        if (document.hidden && typeof Notification !== "undefined") {
          const senderName =
            contactsRef.current[msg.fromAddress]?.nickname ??
            `${msg.fromAddress.slice(0, 6)}…${msg.fromAddress.slice(-4)}`;
          new Notification(`Null — ${group.name}`, {
            body: `${senderName}: ${content}`,
            silent: false,
          });
        }
      } else if (msg.type === "group-member-update") {
        const group = groupsRef.current[msg.groupId];
        if (!group || msg.adminAddress !== group.adminAddress) return;
        const updated =
          msg.action === "add"
            ? [...group.memberAddresses, msg.targetAddress]
            : group.memberAddresses.filter((a) => a !== msg.targetAddress);
        dispatch({ type: "UPDATE_GROUP_MEMBERS", groupId: msg.groupId, memberAddresses: updated });
        void window.nullBridge.storage.put(
          `group:${msg.groupId}`,
          JSON.stringify({ ...group, memberAddresses: updated })
        );
      } else if (msg.type === "group-leave") {
        const group = groupsRef.current[msg.groupId];
        if (!group) return;
        const updated = group.memberAddresses.filter((a) => a !== msg.fromAddress);
        dispatch({ type: "UPDATE_GROUP_MEMBERS", groupId: msg.groupId, memberAddresses: updated });
        void window.nullBridge.storage.put(
          `group:${msg.groupId}`,
          JSON.stringify({ ...group, memberAddresses: updated })
        );
      }
    }

    // ── Incoming message ─────────────────────────────────────────────────────
    pm.onMessage(async (fromAddress, rawData) => {
      const privKey = getPrivateKey();
      if (!privKey) return;

      // ── File protocol messages ─────────────────────────────────────────────
      const fileMsg = parseFileWireMessage(rawData);
      if (fileMsg) {
        let contact: Contact | undefined = contactsRef.current[fromAddress];
        if (!contact) return; // Can't decrypt without pubkey

        if (fileMsg.type === "file-meta") {
          const meta = fileMsg;
          // Create a placeholder LocalMessage for this transfer
          const local: LocalMessage = {
            id: meta.transferId,
            fromAddress,
            toAddress: walletAddress,
            content: "",
            timestamp: meta.timestamp,
            status: "delivered",
            fileRef: {
              transferId: meta.transferId,
              fileName: meta.fileName,
              mimeType: meta.mimeType,
              totalSize: meta.totalSize,
              totalChunks: meta.totalChunks,
              receivedChunks: 0,
            },
          };
          fileBuffers.current.set(meta.transferId, {
            meta,
            chunks: new Map(),
            messageId: meta.transferId,
            fromAddress,
          });
          dispatch({ type: "RECEIVE_MESSAGE", contactAddress: fromAddress, message: local });

          // Persist placeholder (without bytes) to storage
          const storageMsg = { ...local, fileRef: { ...local.fileRef, bytes: undefined } };
          void window.nullBridge.storage.put(
            msgStorageKey(fromAddress, meta.timestamp, meta.transferId),
            JSON.stringify(storageMsg)
          );

          // OS notification
          if (document.hidden && typeof Notification !== "undefined") {
            const name = contact.nickname ?? `${fromAddress.slice(0, 6)}…${fromAddress.slice(-4)}`;
            new Notification(`Null — ${name}`, {
              body: `Sent you a file: ${meta.fileName}`,
              silent: false,
            });
          }
          return;
        }

        if (fileMsg.type === "file-chunk") {
          const buf = fileBuffers.current.get(fileMsg.transferId);
          if (!buf) return;

          try {
            const key = await deriveFileKey(privKey, hexToBytes(contact.pubkeyHex));
            const chunkBytes = await decryptFileChunk(key, fileMsg.data, fileMsg.iv);
            buf.chunks.set(fileMsg.index, chunkBytes);

            // Update progress
            dispatch({
              type: "UPDATE_FILE_REF",
              contactAddress: fromAddress,
              messageId: buf.messageId,
              fileRef: { receivedChunks: buf.chunks.size },
            });

            // Check if all chunks received
            if (buf.chunks.size === buf.meta.totalChunks) {
              // Assemble
              const assembled = new Uint8Array(buf.meta.totalSize);
              let offset = 0;
              for (let i = 1; i <= buf.meta.totalChunks; i++) {
                const chunk = buf.chunks.get(i)!;
                assembled.set(chunk, offset);
                offset += chunk.byteLength;
              }
              fileBuffers.current.delete(fileMsg.transferId);

              // Update message with bytes
              dispatch({
                type: "UPDATE_FILE_REF",
                contactAddress: fromAddress,
                messageId: buf.messageId,
                fileRef: { bytes: assembled, receivedChunks: buf.meta.totalChunks },
              });

              // Persist bytes to LevelDB (base64) for session persistence
              let b64 = "";
              for (let i = 0; i < assembled.byteLength; i++) {
                b64 += String.fromCharCode(assembled[i]!);
              }
              void window.nullBridge.storage.put(
                `file:${fromAddress}:${buf.meta.transferId}`,
                btoa(b64)
              );
            }
          } catch (err) {
            console.error("[file-transfer] chunk decryption failed:", err);
            // Mark transfer as failed so the UI shows an error
            dispatch({
              type: "UPDATE_MESSAGE_STATUS",
              contactAddress: fromAddress,
              messageId: buf.messageId,
              status: "failed",
            });
            fileBuffers.current.delete(fileMsg.transferId);
          }
          return;
        }

        if (fileMsg.type === "file-complete") {
          const buf = fileBuffers.current.get(fileMsg.transferId);
          if (buf && buf.chunks.size < buf.meta.totalChunks) {
            // Sender finished but we're missing chunks — mark failed
            dispatch({
              type: "UPDATE_MESSAGE_STATUS",
              contactAddress: fromAddress,
              messageId: buf.messageId,
              status: "failed",
            });
            fileBuffers.current.delete(fileMsg.transferId);
          }
          return;
        }
        return;
      }

      // ── Group wire messages ──────────────────────────────────────────────
      const groupMsg = parseGroupWireMessage(rawData);
      if (groupMsg) {
        await handleGroupMessage(groupMsg, fromAddress, privKey);
        return;
      }

      // ── Chat messages ────────────────────────────────────────────────────
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
      fileBuffers.current.clear();
    };
  }, [state.wallet?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  return pmRef;
}

// ── Re-export helpers so ConversationPage can use them ─────────────────────
export { msgStorageKey, CHUNK_SIZE };
