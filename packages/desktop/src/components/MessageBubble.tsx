import type { LocalMessage } from "../context/reducer.js";

interface Props {
  message: LocalMessage;
  isMine: boolean;
}

const STATUS = {
  pending:   { symbol: "○", color: "var(--muted)",     label: "queued — will deliver when they come online" },
  delivered: { symbol: "✓", color: "var(--green-dim)", label: "delivered" },
  failed:    { symbol: "✗", color: "var(--red)",        label: "failed to deliver" },
} as const;

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

export function MessageBubble({ message, isMine }: Props) {
  const status = STATUS[message.status];
  const dateLabel = formatDate(message.timestamp);

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
        <div
          style={{
            fontSize: "10px",
            color: "var(--muted)",
            alignSelf: "center",
            padding: "4px 0 8px",
          }}
        >
          {dateLabel}
        </div>
      )}
      <div
        style={{
          background: isMine ? "var(--bg-surface)" : "transparent",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          padding: "8px 12px",
          maxWidth: "70%",
          wordBreak: "break-word",
          fontSize: "13px",
          color: "var(--green)",
          lineHeight: 1.5,
          userSelect: "text",
        }}
      >
        {message.content}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "10px",
          color: "var(--muted)",
        }}
      >
        <span>{formatTime(message.timestamp)}</span>
        {isMine && (
          <span
            style={{ color: status.color, cursor: "default" }}
            title={status.label}
          >
            {status.symbol}
          </span>
        )}
      </div>
    </div>
  );
}
