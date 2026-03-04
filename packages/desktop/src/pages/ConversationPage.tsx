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
import {
  prepareTransfer,
  encryptFileChunk,
  deriveFileKey,
  CHUNK_SIZE,
  MAX_FILE_SIZE,
  type FileMetaChunk,
  type FileDataChunk,
  type FileCompleteChunk,
} from "@null/core/messaging";
import type { PeerManager } from "@null/core/p2p";
import { MessageBubble } from "../components/MessageBubble.js";
import { QRCodeDisplay } from "../components/QRCodeDisplay.js";
import { PaymentComposer } from "../components/PaymentComposer.js";
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
    flexDirection: "column" as const,
  },
  inputRow: {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
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
  attachBtn: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "16px",
    padding: "5px 8px",
    alignSelf: "flex-end" as const,
    flexShrink: 0,
    lineHeight: 1,
  },
  progressBar: {
    fontSize: "11px",
    color: "var(--muted)",
    padding: "2px 0",
  },
  errorText: {
    fontSize: "11px",
    color: "var(--red)",
    padding: "2px 0",
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
  editPanel: {
    borderTop: "1px solid var(--border)",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    flexShrink: 0,
    background: "var(--bg-surface)",
  },
  editPanelTitle: {
    fontSize: "10px",
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
  },
  editRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  editInput: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--green)",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: "6px 10px",
    flex: 1,
    outline: "none",
  },
  saveBtn: {
    background: "transparent",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "11px",
    padding: "6px 12px",
  },
  dangerBtn: {
    background: "transparent",
    border: "1px solid var(--red)",
    borderRadius: "2px",
    color: "var(--red)",
    cursor: "pointer",
    fontSize: "11px",
    padding: "6px 12px",
  },
  dangerRow: {
    display: "flex",
    gap: "8px",
    paddingTop: "4px",
    borderTop: "1px solid var(--border)",
  },
};

export function ConversationPage({ contactAddress, pmRef }: Props) {
  const { state, dispatch, getPrivateKey } = useApp();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [fileProgress, setFileProgress] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contact = state.contacts[contactAddress];
  const conversation = state.conversations[contactAddress];
  const messages = conversation?.messages ?? [];
  const peerStatus = state.peerStatuses[contactAddress];
  const statusColor = STATUS_COLORS[peerStatus ?? "disconnected"];

  const label =
    contact?.nickname ??
    `${contactAddress.slice(0, 6)}…${contactAddress.slice(-4)}`;

  function openEdit() {
    setNicknameInput(contact?.nickname ?? "");
    setShowQR(false);
    setShowEdit((v) => !v);
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    const trimmed = nicknameInput.trim();
    dispatch({ type: "RENAME_CONTACT", address: contactAddress, nickname: trimmed });
    if (contact) {
      const updated = { ...contact, nickname: trimmed || undefined, addedAt: Date.now() };
      await window.nullBridge.storage.put(`contact:${contactAddress}`, JSON.stringify(updated));
    }
    setShowEdit(false);
  }

  async function handleRemoveContact() {
    if (!window.confirm(`Remove ${label} from contacts?`)) return;
    dispatch({ type: "REMOVE_CONTACT", address: contactAddress });
    await window.nullBridge.storage.del(`contact:${contactAddress}`);
    setShowEdit(false);
  }

  async function handleClearConversation() {
    if (!window.confirm("Clear all messages in this conversation? This cannot be undone.")) return;
    dispatch({ type: "CLEAR_CONVERSATION", address: contactAddress });
    const rows = await window.nullBridge.storage.list(`msg:${contactAddress}:`);
    for (const row of rows) {
      await window.nullBridge.storage.del(row.key);
    }
    setShowEdit(false);
  }

  async function handleDeleteConversation() {
    if (!window.confirm("Delete this entire conversation and remove contact?")) return;
    const rows = await window.nullBridge.storage.list(`msg:${contactAddress}:`);
    for (const row of rows) {
      await window.nullBridge.storage.del(row.key);
    }
    await window.nullBridge.storage.del(`contact:${contactAddress}`);
    dispatch({ type: "REMOVE_CONTACT", address: contactAddress });
    dispatch({ type: "DELETE_CONVERSATION", address: contactAddress });
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function sendContent(content: string) {
    if (!contact || !state.wallet) return;
    const privKey = getPrivateKey();
    if (!privKey) return;

    const encrypted: EncryptedMessage = await encryptMessage({
      content,
      fromAddress: state.wallet.address,
      toAddress: contactAddress,
      senderPrivKey: privKey,
      recipientPubKey: hexToBytes(contact.pubkeyHex),
    });

    const local: LocalMessage = {
      id: encrypted.id,
      fromAddress: state.wallet.address,
      toAddress: contactAddress,
      content,
      timestamp: encrypted.timestamp,
      status: "pending",
    };
    dispatch({ type: "SEND_MESSAGE", contactAddress, message: local });

    await window.nullBridge.storage.put(
      msgStorageKey(contactAddress, encrypted.timestamp, encrypted.id),
      JSON.stringify(local)
    );

    const wirePayload = wrapEnvelope(encrypted, state.wallet.pubkeyHex);
    const pm = pmRef.current;
    const sent = pm?.sendTo(contactAddress, wirePayload) ?? false;

    if (sent) {
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
      void pm?.connectToPeer(contactAddress);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    setSending(true);
    try {
      await sendContent(content);
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

  function handleAttachClick() {
    setFileError(null);
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so same file can be re-selected
    e.target.value = "";
    if (file) void sendFile(file);
  }

  async function sendFile(file: File) {
    if (!contact || !state.wallet) return;
    const privKey = getPrivateKey();
    if (!privKey) return;

    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File too large (max 25 MB). This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }

    if (peerStatus !== "connected") {
      setFileError("Files can only be sent to online contacts. Wait for them to come online.");
      return;
    }

    const pm = pmRef.current;
    if (!pm) return;

    setFileError(null);

    const arrayBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer);
    const key = await deriveFileKey(privKey, hexToBytes(contact.pubkeyHex));
    const { transferId, meta, totalChunks } = prepareTransfer(
      file.name,
      file.type || "application/octet-stream",
      file.size
    );

    // Optimistic local message
    const local: LocalMessage = {
      id: transferId,
      fromAddress: state.wallet.address,
      toAddress: contactAddress,
      content: "",
      timestamp: meta.timestamp,
      status: "pending",
      fileRef: {
        transferId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        totalSize: file.size,
        totalChunks,
        bytes: fileBytes,
      },
    };
    dispatch({ type: "SEND_MESSAGE", contactAddress, message: local });

    // Persist metadata without bytes
    const storedFileRef = { transferId, fileName: file.name, mimeType: file.type || "application/octet-stream", totalSize: file.size, totalChunks };
    await window.nullBridge.storage.put(
      msgStorageKey(contactAddress, meta.timestamp, transferId),
      JSON.stringify({ ...local, fileRef: storedFileRef })
    );

    // Store bytes for persistence (sender sees image after restart)
    let b64 = "";
    for (let i = 0; i < fileBytes.byteLength; i++) {
      b64 += String.fromCharCode(fileBytes[i]!);
    }
    await window.nullBridge.storage.put(`file:${contactAddress}:${transferId}`, btoa(b64));

    try {
      // Send meta
      pm.sendTo(contactAddress, JSON.stringify(meta as FileMetaChunk));

      // Send chunks with backpressure
      const BACKPRESSURE_THRESHOLD = 1 * 1024 * 1024;
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileBytes.byteLength);
        const chunk = fileBytes.slice(start, end);

        while (pm.getBufferedAmount(contactAddress) > BACKPRESSURE_THRESHOLD) {
          await new Promise((r) => setTimeout(r, 50));
        }

        const { data, iv } = await encryptFileChunk(key, chunk);
        const chunkMsg: FileDataChunk = { type: "file-chunk", transferId, index: i + 1, data, iv };
        pm.sendTo(contactAddress, JSON.stringify(chunkMsg));

        setFileProgress(`Sending ${file.name}… ${i + 1}/${totalChunks}`);
      }

      const completeMsg: FileCompleteChunk = { type: "file-complete", transferId };
      pm.sendTo(contactAddress, JSON.stringify(completeMsg));

      dispatch({ type: "UPDATE_MESSAGE_STATUS", contactAddress, messageId: transferId, status: "delivered" });
      await window.nullBridge.storage.put(
        msgStorageKey(contactAddress, meta.timestamp, transferId),
        JSON.stringify({ ...local, fileRef: storedFileRef, status: "delivered" })
      );
    } catch (err) {
      console.error("File send failed:", err);
      dispatch({ type: "UPDATE_MESSAGE_STATUS", contactAddress, messageId: transferId, status: "failed" });
      setFileError("File send failed.");
    } finally {
      setFileProgress(null);
    }
  }

  return (
    <div style={s.page}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <button
            style={s.back}
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "home" })}
          >
            ←
          </button>
          <span style={{ ...s.statusDot, background: statusColor }} />
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
          {contact && (
            <button
              style={{ ...s.actionBtn, color: showEdit ? "var(--green)" : "var(--muted)" }}
              onClick={openEdit}
              title="Edit contact"
            >
              edit
            </button>
          )}
          <button
            style={s.actionBtn}
            onClick={() => { setShowQR((v) => !v); setShowEdit(false); }}
            title="Show/hide your QR code"
          >
            {showQR ? "hide qr" : "my qr"}
          </button>
        </div>
      </div>

      {/* QR panel */}
      {showQR && state.wallet && (
        <div style={s.qrPanel}>
          <QRCodeDisplay address={state.wallet.address} pubkeyHex={state.wallet.pubkeyHex} />
        </div>
      )}

      {/* Edit contact panel */}
      {showEdit && contact && (
        <div style={s.editPanel}>
          <div style={s.editPanelTitle}>Edit contact</div>
          <form onSubmit={handleRename} style={s.editRow}>
            <input
              style={s.editInput}
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="Nickname (leave blank to clear)"
              maxLength={40}
              autoFocus
            />
            <button type="submit" style={s.saveBtn}>Save</button>
          </form>
          <div style={s.dangerRow}>
            <button style={s.dangerBtn} onClick={handleClearConversation}>Clear history</button>
            <button style={s.dangerBtn} onClick={handleRemoveContact}>Remove contact</button>
            <button style={s.dangerBtn} onClick={handleDeleteConversation}>Delete &amp; remove</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={s.messages}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "12px", marginTop: "40px" }}>
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

      {/* Payment composer */}
      {showPayment && contact && (
        <PaymentComposer
          recipientAddress={contactAddress}
          getPrivateKey={getPrivateKey}
          onSend={sendContent}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* Input */}
      <div style={s.inputBar}>
        {fileProgress && <div style={s.progressBar}>{fileProgress}</div>}
        {fileError && <div style={s.errorText}>{fileError}</div>}
        <form onSubmit={handleSend} style={s.inputRow}>
          <button
            type="button"
            style={s.attachBtn}
            onClick={handleAttachClick}
            disabled={!contact || !!fileProgress || peerStatus !== "connected"}
            title={peerStatus !== "connected" ? "Files can only be sent to online contacts" : "Send a file"}
          >
            📎
          </button>
          <button
            type="button"
            style={{
              ...s.attachBtn,
              color: showPayment ? "var(--green)" : "var(--muted)",
              borderColor: showPayment ? "var(--green)" : "var(--border)",
            }}
            onClick={() => { setShowPayment((v) => !v); setShowQR(false); setShowEdit(false); }}
            disabled={!contact}
            title="Send a payment on Base"
          >
            $
          </button>
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
            style={{ ...s.input, height: "auto", minHeight: "38px", maxHeight: "120px" }}
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
    </div>
  );
}
