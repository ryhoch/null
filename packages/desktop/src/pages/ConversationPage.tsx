import {
  useState,
  useRef,
  useEffect,
  type FormEvent,
  type MutableRefObject,
} from "react";
import { encryptMessage } from "@null/core/messaging";
import { hexToBytes } from "@null/core/crypto";
import type { EncryptedMessage } from "@null/core/crypto";
import type { PeerManager } from "@null/core/p2p";
import { MessageBubble } from "../components/MessageBubble.js";
import { QRCodeDisplay } from "../components/QRCodeDisplay.js";
import { useApp } from "../context/AppContext.js";
import type { LocalMessage } from "../context/reducer.js";
import { msgStorageKey, wrapEnvelope } from "../hooks/usePeerManager.js";

interface Props {
  contactAddress: string;
  pmRef: MutableRefObject<PeerManager | null>;
}

const STATUS_COLORS = {
  connected: "#00ff41",
  connecting: "#ffaa00",
  disconnected: "#555555",
} as const;

const s = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  header: {
    padding: "12px 20px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  back: {
    background: "transparent",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "13px",
    padding: 0,
  },
  contactName: {
    fontSize: "13px",
    color: "var(--green)",
    fontWeight: "bold" as const,
  },
  statusDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  headerActions: {
    display: "flex",
    gap: "8px",
  },
  actionBtn: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "11px",
    padding: "4px 10px",
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column" as const,
  },
  inputBar: {
    borderTop: "1px solid var(--border)",
    padding: "12px 20px",
    display: "flex",
    gap: "8px",
    flexShrink: 0,
  },
  input: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--green)",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: "8px 12px",
    flex: 1,
    outline: "none",
    resize: "none" as const,
  },
  sendBtn: {
    background: "transparent",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "12px",
    padding: "8px 16px",
    alignSelf: "flex-end" as const,
  },
  qrPanel: {
    borderTop: "1px solid var(--border)",
    padding: "24px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    flexShrink: 0,
    background: "var(--bg-surface)",
  },
};

export function ConversationPage({ contactAddress, pmRef }: Props) {
  const { state, dispatch, getPrivateKey } = useApp();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contact = state.contacts[contactAddress];
  const conversation = state.conversations[contactAddress];
  const messages = conversation?.messages ?? [];
  const peerStatus = state.peerStatuses[contactAddress];
  const statusColor = STATUS_COLORS[peerStatus ?? "disconnected"];

  const label =
    contact?.nickname ??
    `${contactAddress.slice(0, 6)}…${contactAddress.slice(-4)}`;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    if (!contact || !state.wallet) return;

    const privKey = getPrivateKey();
    if (!privKey) return;

    setDraft("");
    setSending(true);

    try {
      // 1. Encrypt in renderer (Web Crypto)
      const encrypted: EncryptedMessage = await encryptMessage({
        content,
        fromAddress: state.wallet.address,
        toAddress: contactAddress,
        senderPrivKey: privKey,
        recipientPubKey: hexToBytes(contact.pubkeyHex),
      });

      // 2. Optimistic local message with 'pending' status
      const local: LocalMessage = {
        id: encrypted.id,
        fromAddress: state.wallet.address,
        toAddress: contactAddress,
        content,
        timestamp: encrypted.timestamp,
        status: "pending",
      };
      dispatch({ type: "SEND_MESSAGE", contactAddress, message: local });

      // 3. Persist plaintext to local storage
      await window.nullBridge.storage.put(
        msgStorageKey(contactAddress, encrypted.timestamp, encrypted.id),
        JSON.stringify(local)
      );

      // 4. Try to deliver via P2P
      // Wrap in v1 envelope so the recipient can decrypt even without us in their contacts
      const wirePayload = wrapEnvelope(encrypted, state.wallet.pubkeyHex);
      const pm = pmRef.current;
      const sent = pm?.sendTo(contactAddress, wirePayload) ?? false;

      if (sent) {
        // Immediate delivery
        dispatch({
          type: "UPDATE_MESSAGE_STATUS",
          contactAddress,
          messageId: encrypted.id,
          status: "delivered",
        });
        await window.nullBridge.storage.put(
          msgStorageKey(contactAddress, encrypted.timestamp, encrypted.id),
          JSON.stringify({ ...local, status: "delivered" })
        );
      } else {
        // Peer offline — enqueue envelope (includes pubkey for unknown-sender recovery)
        const queueEntry = {
          id: encrypted.id,
          encryptedPayload: wirePayload,
          recipientAddress: contactAddress,
          timestamp: Date.now(),
          attempts: 0,
          nextRetryAt: Date.now(),
        };
        await window.nullBridge.storage.put(
          `queue:${contactAddress}:${encrypted.id}`,
          JSON.stringify(queueEntry)
        );

        // Initiate WebRTC connection so message delivers when peer comes online
        void pm?.connectToPeer(contactAddress);
      }
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(e as unknown as FormEvent);
    }
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <button
            style={s.back}
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "home" })}
          >
            ←
          </button>
          <span
            style={{
              ...s.statusDot,
              background: statusColor,
            }}
          />
          <span style={s.contactName}>{label}</span>
          <span style={{ fontSize: "10px", color: peerStatus === "connecting" ? "#ffaa00" : "var(--muted)" }}>
            {peerStatus === "connected"
              ? contactAddress.slice(0, 10) + "…"
              : peerStatus === "connecting"
              ? "connecting…"
              : "offline"}
          </span>
        </div>

        <div style={s.headerActions}>
          <button
            style={s.actionBtn}
            onClick={() => setShowQR((v) => !v)}
            title="Show/hide your QR code"
          >
            {showQR ? "hide qr" : "my qr"}
          </button>
        </div>
      </div>

      {/* QR panel */}
      {showQR && state.wallet && (
        <div style={s.qrPanel}>
          <QRCodeDisplay
            address={state.wallet.address}
            pubkeyHex={state.wallet.pubkeyHex}
          />
        </div>
      )}

      {/* Messages */}
      <div style={s.messages}>
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "12px",
              marginTop: "40px",
            }}
          >
            No messages yet. Say hello.
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.fromAddress === state.wallet?.address}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} style={s.inputBar}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            !contact
              ? "Add this contact first to send a message"
              : peerStatus !== "connected"
              ? "Type a message… (will deliver when they come online)"
              : "Type a message…"
          }
          disabled={!contact || sending}
          rows={1}
          style={{
            ...s.input,
            height: "auto",
            minHeight: "38px",
            maxHeight: "120px",
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending || !contact}
          style={s.sendBtn}
        >
          Send
        </button>
      </form>
    </div>
  );
}
