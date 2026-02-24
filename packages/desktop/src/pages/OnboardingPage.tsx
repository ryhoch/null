import { useState } from "react";
import logoSrc from "../assets/logo.png";
import { EVMWalletProvider } from "@null/core/wallet";
import { seal, unseal } from "@null/core/wallet";
import { bytesToHex, hexToBytes } from "@null/core/crypto";
import { PasscodeInput } from "../components/PasscodeInput.js";
import { useApp } from "../context/AppContext.js";

type Step =
  | "choose"       // pick generate or import
  | "import-key"   // paste private key hex
  | "set-passcode" // enter new passcode
  | "confirm"      // confirm passcode
  | "done";        // finalising keystore

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
  subtitle: {
    fontSize: "13px",
    color: "var(--muted)",
    letterSpacing: "0.1em",
  },
  card: {
    border: "1px solid var(--border)",
    borderRadius: "4px",
    padding: "32px",
    width: "100%",
    maxWidth: "420px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "20px",
  },
  row: {
    display: "flex",
    gap: "12px",
  },
  btn: {
    background: "transparent",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "13px",
    padding: "10px 20px",
    flex: 1,
  },
  btnSecondary: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "13px",
    padding: "10px 20px",
    flex: 1,
  },
  input: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--green)",
    fontSize: "12px",
    fontFamily: "var(--font)",
    padding: "8px 12px",
    width: "100%",
    outline: "none",
    letterSpacing: "0.05em",
    resize: "none" as const,
  },
  address: {
    fontSize: "11px",
    color: "var(--green-dim)",
    wordBreak: "break-all" as const,
    padding: "8px",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    background: "var(--bg-surface)",
  },
  label: {
    fontSize: "11px",
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
  },
  error: {
    fontSize: "12px",
    color: "var(--red)",
  },
};

export function OnboardingPage() {
  const { dispatch } = useApp();

  const [step, setStep] = useState<Step>("choose");
  const [importKeyHex, setImportKeyHex] = useState("");
  const [pendingPrivKey, setPendingPrivKey] = useState<Uint8Array | null>(null);
  const [pendingAddress, setPendingAddress] = useState("");
  const [pendingPubkeyHex, setPendingPubkeyHex] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Step: generate new wallet ────────────────────────────────────────────

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const wallet = await EVMWalletProvider.generate();
      setPendingPrivKey(wallet.privateKey);
      setPendingAddress(wallet.address);
      setPendingPubkeyHex(bytesToHex(wallet.publicKey));
      setStep("set-passcode");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // ── Step: import via private key ─────────────────────────────────────────

  function handleImportSubmit() {
    setError("");
    let hex = importKeyHex.trim();
    if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      setError("Private key must be 64 hex characters (32 bytes)");
      return;
    }
    try {
      const privBytes = hexToBytes(hex);
      const wallet = EVMWalletProvider.fromPrivateKey(privBytes);
      setPendingPrivKey(privBytes);
      setPendingAddress(wallet.address);
      setPendingPubkeyHex(bytesToHex(wallet.publicKey));
      setStep("set-passcode");
    } catch (e) {
      setError(String(e));
    }
  }

  // ── Step: set passcode ───────────────────────────────────────────────────

  function handleSetPasscode(value: string) {
    setPasscode(value);
    setStep("confirm");
  }

  // ── Step: confirm passcode ───────────────────────────────────────────────

  async function handleConfirmPasscode(confirmed: string) {
    if (confirmed !== passcode) {
      setError("Passcodes do not match");
      return;
    }
    if (!pendingPrivKey) return;

    setError("");
    setLoading(true);
    setStep("done");

    // Yield to the event loop so React can commit the "Sealing keystore..." render
    // before PBKDF2 blocks the JS thread for ~0.9s.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    try {
      const keystore = await seal(pendingPrivKey, passcode, pendingAddress);

      // Zero the private key immediately after sealing
      pendingPrivKey.fill(0);
      setPendingPrivKey(null);

      // Persist keystore and pubkey
      await Promise.all([
        window.nullBridge.storage.put("keystore", JSON.stringify(keystore)),
        window.nullBridge.storage.put("wallet:pubkey", pendingPubkeyHex),
      ]);

      // Immediately unseal (we still have the passcode) to unlock the app
      const freshPrivKey = await unseal(keystore, passcode);

      dispatch({ type: "SET_KEYSTORE", keystore });
      dispatch({
        type: "UNLOCK_WALLET",
        wallet: { address: pendingAddress, pubkeyHex: pendingPubkeyHex },
        privateKey: freshPrivKey,
      });
    } catch (e) {
      setError(String(e));
      setStep("confirm");
    } finally {
      setLoading(false);
      setPasscode("");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>
      <img src={logoSrc} alt="Null" style={{ width: "220px", display: "block", mixBlendMode: "screen" }} />

      <div style={s.card}>
        {step === "choose" && (
          <>
            <div style={s.label}>Get started</div>
            <div style={s.row}>
              <button style={s.btn} onClick={handleGenerate} disabled={loading}>
                {loading ? "generating..." : "Generate wallet"}
              </button>
              <button style={s.btnSecondary} onClick={() => setStep("import-key")}>
                Import key
              </button>
            </div>
          </>
        )}

        {step === "import-key" && (
          <>
            <div style={s.label}>Private key (hex)</div>
            <textarea
              style={{ ...s.input, height: "80px" }}
              value={importKeyHex}
              onChange={(e) => setImportKeyHex(e.target.value)}
              placeholder="0x... or raw 64 hex chars"
              autoFocus
            />
            {error && <span style={s.error}>{error}</span>}
            <div style={s.row}>
              <button style={s.btn} onClick={handleImportSubmit}>
                Import →
              </button>
              <button style={s.btnSecondary} onClick={() => { setStep("choose"); setError(""); }}>
                Back
              </button>
            </div>
          </>
        )}

        {step === "set-passcode" && (
          <>
            <div style={s.label}>Your address</div>
            <div style={s.address}>{pendingAddress}</div>
            <PasscodeInput mode="set" onSubmit={handleSetPasscode} />
          </>
        )}

        {step === "confirm" && (
          <>
            <PasscodeInput
              mode="confirm"
              onSubmit={handleConfirmPasscode}
              error={error || undefined}
              loading={loading}
            />
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center" as const, color: "var(--muted)", fontSize: "13px" }}>
            Sealing keystore...
          </div>
        )}
      </div>
    </div>
  );
}
