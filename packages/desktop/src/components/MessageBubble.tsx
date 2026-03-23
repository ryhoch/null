import { useState, useEffect, useRef } from "react";
import type { LocalMessage } from "../context/reducer.js";
import { parsePaymentContent } from "../lib/payments.js";
import { PaymentBubble } from "./PaymentBubble.js";
import { VoiceNoteBubble } from "./VoiceNoteBubble.js";

interface Props {
  message: LocalMessage;
  isMine: boolean;
}

const STATUS = {
  pending:   { symbol: "○", color: "var(--muted)",     label: "queued — will deliver when they come online" },
  delivered: { symbol: "✓", color: "var(--green-dim)", label: "delivered" },
  failed:    { symbol: "✗", color: "var(--red)",        label: "failed to deliver" },
} as const;

// ── Hooks ───────────────────────────────────────────────────────────────────

function useCountdown(expiresAt: number | undefined): string | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return; }
    const update = () => setRemaining(Math.max(0, expiresAt - Date.now()));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (remaining === null || remaining <= 0) return null;

  const s = Math.floor(remaining / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── File content (images + generic files) ────────────────────────────────────

function FileContent({ message, isMine }: { message: LocalMessage; isMine: boolean }) {
  const ref = message.fileRef;

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(ref?.savedPath ?? null);
  const prevBytesRef = useRef<Uint8Array | undefined>(undefined);

  useEffect(() => {
    if (!ref?.bytes || ref.bytes === prevBytesRef.current) return;
    prevBytesRef.current = ref.bytes;
    const buf = ref.bytes.buffer.slice(
      ref.bytes.byteOffset,
      ref.bytes.byteOffset + ref.bytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([buf], { type: ref.mimeType });
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [ref?.bytes, ref?.mimeType]);

  if (!ref) return null;

  const isImage = ref.mimeType.startsWith("image/");
  const isReceiving = !ref.bytes && message.status !== "failed";
  const progress = isReceiving && ref.totalChunks
    ? `${ref.receivedChunks ?? 0}/${ref.totalChunks} chunks`
    : null;

  async function handleSave() {
    const bytes = ref?.bytes;
    if (!bytes) return;
    setSaving(true);
    try {
      const path = await window.nullBridge.system.saveFile(ref.fileName, Array.from(bytes));
      setSavedPath(path);
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  }

  if (isImage) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {objectUrl ? (
          <img
            src={objectUrl}
            alt={ref.fileName}
            style={{ maxWidth: "280px", maxHeight: "280px", borderRadius: "4px", cursor: "pointer", display: "block" }}
            onClick={() => window.open(objectUrl, "_blank")}
            title={ref.fileName}
          />
        ) : (
          <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>
            {isReceiving ? `receiving image…${progress ? ` (${progress})` : ""}` : "image unavailable"}
          </div>
        )}
        <div style={{ fontSize: "10px", color: "var(--muted)" }}>
          {ref.fileName} · {formatBytes(ref.totalSize)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "20px", lineHeight: 1 }}>📄</span>
        <div>
          <div style={{ fontSize: "13px", color: "var(--green)" }}>{ref.fileName}</div>
          <div style={{ fontSize: "10px", color: "var(--muted)" }}>
            {formatBytes(ref.totalSize)}{isReceiving && progress ? ` · receiving… ${progress}` : ""}
          </div>
        </div>
      </div>
      {savedPath ? (
        <div style={{ fontSize: "10px", color: "var(--muted)", fontStyle: "italic" }}>Saved to Downloads</div>
      ) : ref.bytes ? (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: "transparent",
            border: "1px solid var(--green)",
            borderRadius: "2px",
            color: "var(--green)",
            cursor: saving ? "default" : "pointer",
            fontSize: "11px",
            padding: "4px 10px",
            alignSelf: "flex-start",
          }}
        >
          {saving ? "Saving…" : isMine ? "Save copy" : "Save"}
        </button>
      ) : null}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MessageBubble({ message, isMine }: Props) {
  const countdown = useCountdown(message.expiresAt);
  const status = STATUS[message.status];
  const dateLabel = formatDate(message.timestamp);

  const isVoiceNote = !!message.fileRef && message.fileRef.mimeType.startsWith("audio/");
  const isFile = !!message.fileRef && !isVoiceNote;
  const payment = !message.fileRef ? parsePaymentContent(message.content) : null;

  if (message.disappeared) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: "4px", marginBottom: "8px" }}>
        {dateLabel && (
          <div style={{ fontSize: "10px", color: "var(--muted)", alignSelf: "center", padding: "4px 0 8px" }}>
            {dateLabel}
          </div>
        )}
        <div style={{
          fontSize: "11px",
          color: "#333",
          fontStyle: "italic",
          padding: "6px 12px",
          border: "1px solid #1a1a1a",
          borderRadius: "2px",
        }}>
          [ message disappeared ]
        </div>
        <div style={{ fontSize: "10px", color: "#2a2a2a" }}>{formatTime(message.timestamp)}</div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isMine ? "flex-end" : "flex-start",
        gap: "4px",
        marginBottom: "8px",
      }}
    >
      {dateLabel && (
        <div style={{ fontSize: "10px", color: "var(--muted)", alignSelf: "center", padding: "4px 0 8px" }}>
          {dateLabel}
        </div>
      )}

      <div
        style={{
          background: isMine ? "var(--bg-surface)" : "transparent",
          border: `1px solid ${payment ? "rgba(0,255,65,0.25)" : "var(--border)"}`,
          borderRadius: "4px",
          padding: isFile || payment || isVoiceNote ? "10px 12px" : "8px 12px",
          maxWidth: isFile || payment || isVoiceNote ? "340px" : "70%",
          wordBreak: "break-word",
          fontSize: "13px",
          color: "var(--green)",
          lineHeight: 1.5,
          userSelect: "text",
        }}
      >
        {isVoiceNote && message.fileRef ? (
          <VoiceNoteBubble fileRef={message.fileRef} isMine={isMine} />
        ) : isFile ? (
          <FileContent message={message} isMine={isMine} />
        ) : payment ? (
          <PaymentBubble payload={payment} isMine={isMine} />
        ) : (
          message.content
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--muted)" }}>
        <span>{formatTime(message.timestamp)}</span>
        {isMine && (
          <span
            style={{ color: message.read ? "var(--green)" : status.color, cursor: "default", letterSpacing: message.read ? "-2px" : undefined }}
            title={message.read ? "read" : status.label}
          >
            {message.read ? "✓✓" : status.symbol}
          </span>
        )}
        {countdown !== null && (
          <span
            title="Message will disappear"
            style={{
              color: countdown.endsWith("s") ? "#ff4444" : "#ffaa00",
              fontSize: "9px",
              letterSpacing: "0.05em",
            }}
          >
            ↓{countdown}
          </span>
        )}
      </div>
    </div>
  );
}
