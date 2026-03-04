import type { PaymentPayload } from "../lib/payments.js";

interface Props {
  payload: PaymentPayload;
  isMine: boolean;
}

const BASE_SCAN = "https://basescan.org/tx/";

export function PaymentBubble({ payload, isMine }: Props) {
  const { token, amount, txHash, note } = payload;
  const label = isMine ? `Sent ${amount} ${token}` : `Received ${amount} ${token}`;
  const icon = token === "ETH" ? "⟠" : "$";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: "220px",
      }}
    >
      {/* Amount row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: isMine ? "rgba(0,255,65,0.12)" : "rgba(0,255,65,0.06)",
            border: "1px solid rgba(0,255,65,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "15px",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div>
          <div
            style={{
              fontSize: "15px",
              fontWeight: "bold",
              color: "var(--green)",
              lineHeight: 1.2,
            }}
          >
            {amount} {token}
          </div>
          <div style={{ fontSize: "10px", color: "var(--muted)", lineHeight: 1.3 }}>
            {label}
          </div>
        </div>
      </div>

      {/* Note */}
      {note && (
        <div
          style={{
            fontSize: "12px",
            color: "var(--muted)",
            fontStyle: "italic",
          }}
        >
          &ldquo;{note}&rdquo;
        </div>
      )}

      {/* Tx link */}
      {txHash && txHash !== "pending" ? (
        <a
          href={BASE_SCAN + txHash}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: "10px",
            color: "var(--green-dim)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            opacity: 0.7,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1" }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7" }}
        >
          View on BaseScan ↗
        </a>
      ) : (
        <div style={{ fontSize: "10px", color: "var(--muted)" }}>
          broadcasting…
        </div>
      )}

      {/* Label */}
      <div
        style={{
          fontSize: "9px",
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          opacity: 0.6,
        }}
      >
        Base Network · On-chain payment
      </div>
    </div>
  );
}
