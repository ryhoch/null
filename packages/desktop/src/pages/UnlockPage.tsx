import { useState } from "react";
import logoSrc from "../assets/logo.png";
import { unseal } from "@null/core/wallet";
import { PasscodeInput } from "../components/PasscodeInput.js";
import { useApp } from "../context/AppContext.js";

const s = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    gap: "32px",
    padding: "40px",
  },
  title: {
    fontSize: "28px",
    letterSpacing: "0.3em",
    color: "var(--green)",
  },
  address: {
    fontSize: "11px",
    color: "var(--muted)",
    letterSpacing: "0.05em",
  },
  card: {
    border: "1px solid var(--border)",
    borderRadius: "4px",
    padding: "32px",
    width: "100%",
    maxWidth: "420px",
  },
};

export function UnlockPage() {
  const { state, dispatch } = useApp();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const address = state.keystore?.address ?? "";

  async function handleReset() {
    const confirmed = window.confirm(
      "Remove this wallet from device?\n\nMake sure you have your private key backed up — this cannot be undone."
    );
    if (!confirmed) return;
    await window.nullBridge.storage.del("keystore");
    await window.nullBridge.storage.del("wallet:pubkey");
    dispatch({ type: "SET_SCREEN", screen: "onboarding" });
  }

  async function handlePasscode(passcode: string) {
    if (!state.keystore) return;
    setError("");
    setLoading(true);

    // Defer UI update before synchronous PBKDF2 (~0.9s block)
    await new Promise((r) => setTimeout(r, 10));

    try {
      const privKey = await unseal(state.keystore, passcode);

      const pubkeyHex =
        (await window.nullBridge.storage.get("wallet:pubkey")) ?? "";

      dispatch({
        type: "UNLOCK_WALLET",
        wallet: { address, pubkeyHex },
        privateKey: privKey,
      });
    } catch {
      setError("Wrong passcode");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={{ textAlign: "center" as const }}>
        <img src={logoSrc} alt="Null" style={{ width: "200px", display: "block", margin: "0 auto", mixBlendMode: "screen" }} />
        <div style={s.address}>{address}</div>
      </div>

      <div style={s.card}>
        <PasscodeInput
          mode="enter"
          onSubmit={handlePasscode}
          error={error || undefined}
          loading={loading}
        />
      </div>

      <button
        onClick={() => void handleReset()}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          fontSize: "11px",
          letterSpacing: "0.05em",
          padding: "4px 0",
        }}
      >
        Use a different wallet
      </button>
    </div>
  );
}
