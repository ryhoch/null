import { useState, useRef, type FormEvent } from "react";

const s = {
  wrapper: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  },
  label: {
    fontSize: "12px",
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
  },
  input: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--green)",
    fontSize: "16px",
    padding: "8px 12px",
    outline: "none",
    width: "100%",
    letterSpacing: "0.25em",
  },
  error: {
    fontSize: "12px",
    color: "var(--red)",
  },
  btn: {
    background: "transparent",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "13px",
    padding: "8px 20px",
    alignSelf: "flex-start" as const,
  },
};

interface Props {
  /** "set" = enter new passcode; "confirm" = re-enter to confirm; "enter" = unlock */
  mode: "set" | "confirm" | "enter";
  onSubmit: (passcode: string) => void;
  label?: string | undefined;
  error?: string | undefined;
  loading?: boolean | undefined;
}

export function PasscodeInput({ mode, onSubmit, label, error, loading }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const placeholder =
    mode === "enter" ? "enter passcode" : mode === "confirm" ? "confirm passcode" : "choose passcode";

  const labelText =
    label ??
    (mode === "enter"
      ? "Passcode"
      : mode === "confirm"
      ? "Confirm passcode"
      : "Set passcode");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.length < 8) return;
    onSubmit(value);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} style={s.wrapper}>
      <label style={s.label}>{labelText}</label>
      <input
        ref={inputRef}
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        minLength={8}
        autoFocus
        style={{
          ...s.input,
          borderColor: error ? "var(--red)" : "var(--border)",
        }}
        disabled={loading}
      />
      {value.length > 0 && value.length < 8 && (
        <span style={{ fontSize: "11px", color: "var(--muted)" }}>
          minimum 8 characters ({8 - value.length} more)
        </span>
      )}
      {error && <span style={s.error}>{error}</span>}
      <button
        type="submit"
        disabled={value.length < 8 || loading}
        style={{
          ...s.btn,
          opacity: value.length < 8 || loading ? 0.4 : 1,
          cursor: value.length < 8 || loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "working..." : mode === "enter" ? "Unlock" : "Continue →"}
      </button>
    </form>
  );
}
