import { useState, type FormEvent } from "react";
import {
  encodePaymentContent,
  sendEthPayment,
  sendUsdcPayment,
  type PaymentToken,
  type PaymentPayload,
} from "../lib/payments.js";
import { parseEther, parseUnits } from "viem";

interface Props {
  recipientAddress: string;
  getPrivateKey: () => Uint8Array | null;
  onSend: (encodedContent: string) => Promise<void>;
  onClose: () => void;
}

const TOKEN_OPTIONS: PaymentToken[] = ["ETH", "USDC"];

const s = {
  panel: {
    borderTop: "1px solid var(--border)",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    flexShrink: 0,
    background: "var(--bg-surface)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: "10px",
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "14px",
    padding: "0 2px",
  },
  tokenRow: {
    display: "flex",
    gap: "6px",
  },
  tokenBtn: (active: boolean) => ({
    background: active ? "rgba(0,255,65,0.12)" : "transparent",
    border: `1px solid ${active ? "var(--green)" : "var(--border)"}`,
    borderRadius: "2px",
    color: active ? "var(--green)" : "var(--muted)",
    cursor: "pointer",
    fontSize: "12px",
    padding: "4px 14px",
  }),
  input: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--green)",
    fontSize: "14px",
    fontFamily: "var(--font)",
    padding: "8px 12px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  noteInput: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--muted)",
    fontSize: "12px",
    fontFamily: "var(--font)",
    padding: "6px 12px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  sendBtn: {
    background: "rgba(0,255,65,0.1)",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: "8px 20px",
    alignSelf: "flex-end" as const,
  },
  sendBtnDisabled: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--muted)",
    cursor: "not-allowed",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: "8px 20px",
    alignSelf: "flex-end" as const,
  },
  errorText: {
    fontSize: "11px",
    color: "var(--red)",
  },
  row: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
};

export function PaymentComposer({ recipientAddress, getPrivateKey, onSend, onClose }: Props) {
  const [token, setToken] = useState<PaymentToken>("ETH");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      setError("Enter an amount");
      return;
    }

    const privKey = getPrivateKey();
    if (!privKey) {
      setError("Wallet not unlocked");
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Convert to base units
      const amountWei = token === "ETH"
        ? parseEther(amount).toString()
        : parseUnits(amount, 6).toString();

      // Broadcast on-chain first
      let txHash: string;
      if (token === "ETH") {
        txHash = await sendEthPayment(privKey, recipientAddress, amount);
      } else {
        txHash = await sendUsdcPayment(privKey, recipientAddress, amount);
      }

      // Build payload and encode as message content
      const payload: PaymentPayload = {
        token,
        amount,
        amountWei,
        txHash,
        chainId: 8453,
        ...(note.trim() ? { note: note.trim() } : {}),
      };

      await onSend(encodePaymentContent(payload));
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      // Shorten long viem errors
      setError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>Send Payment · Base</span>
        <button style={s.closeBtn} onClick={onClose} title="Close">✕</button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Token selector */}
        <div style={s.tokenRow}>
          {TOKEN_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              style={s.tokenBtn(token === t)}
              onClick={() => setToken(t)}
            >
              {t === "ETH" ? "⟠ ETH" : "$ USDC"}
            </button>
          ))}
        </div>

        {/* Amount */}
        <input
          style={s.input}
          type="number"
          min="0"
          step="any"
          placeholder={token === "ETH" ? "0.001" : "1.00"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          disabled={sending}
        />

        {/* Note */}
        <input
          style={s.noteInput}
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={sending}
          maxLength={80}
        />

        {error && <div style={s.errorText}>{error}</div>}

        <div style={s.row}>
          <div style={{ fontSize: "10px", color: "var(--muted)", flex: 1 }}>
            On-chain · BaseScan link shared with recipient
          </div>
          <button
            type="submit"
            disabled={sending || !amount}
            style={sending || !amount ? s.sendBtnDisabled : s.sendBtn}
          >
            {sending ? "Broadcasting…" : `Send ${token}`}
          </button>
        </div>
      </form>
    </div>
  );
}
