import type { ReactNode } from "react";
import iconSrc from "../assets/icon.png";
import { useApp } from "../context/AppContext.js";

interface Props {
  children: ReactNode;
}

const s = {
  container: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
  },
  sidebar: {
    width: "240px",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column" as const,
    flexShrink: 0,
  },
  sidebarHeader: {
    padding: "16px",
    borderBottom: "1px solid var(--border)",
  },
  logo: {
    fontSize: "18px",
    letterSpacing: "0.4em",
    color: "var(--green)",
  },
  address: {
    fontSize: "10px",
    color: "var(--muted)",
    marginTop: "4px",
    wordBreak: "break-all" as const,
  },
  nav: {
    padding: "8px 0",
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
  },
  navBtn: {
    background: "transparent",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "12px",
    padding: "10px 16px",
    textAlign: "left" as const,
    letterSpacing: "0.1em",
  },
  sidebarFooter: {
    padding: "12px 12px",
    borderTop: "1px solid var(--border)",
  },
  downloadBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "100%",
    padding: "9px 12px",
    border: "1px solid var(--green)",
    borderRadius: "3px",
    background: "transparent",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "var(--font)",
    letterSpacing: "0.08em",
    transition: "background 0.15s",
  },
  downloadLabel: {
    fontSize: "10px",
    color: "var(--muted)",
    textAlign: "center" as const,
    marginTop: "6px",
    letterSpacing: "0.05em",
  },
  main: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
};

export function Layout({ children }: Props) {
  const { state, dispatch } = useApp();

  return (
    <div style={s.container}>
      <div style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <img src={iconSrc} alt="Null" style={{ width: "72px", display: "block", mixBlendMode: "screen" }} />
          <div style={s.address}>
            {state.wallet?.address ?? ""}
          </div>
        </div>

        <div style={s.nav}>
          <button
            style={{
              ...s.navBtn,
              color: state.screen === "home" ? "var(--green)" : "var(--muted)",
            }}
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "home" })}
          >
            Messages
          </button>
          <button
            style={{
              ...s.navBtn,
              color: state.screen === "add-contact" ? "var(--green)" : "var(--muted)",
            }}
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "add-contact" })}
          >
            + Add contact
          </button>
        </div>

        <div style={s.sidebarFooter}>
          {/* Open Nova — primary cross-app CTA */}
          <button
            style={{ ...s.downloadBtn, marginBottom: "6px" }}
            onClick={() => void window.nullBridge.system.launchNova()}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,100,0.08)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
            title="Open Nova DeFi"
          >
            ↗ Open Nova
          </button>
          {/* Download both apps */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              style={{ ...s.downloadBtn, flex: 1, fontSize: "10px", padding: "6px 8px" }}
              onClick={() => window.open("https://github.com/xxcvv2/null/releases/latest", "_blank")}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,100,0.08)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
            >
              ↓ Null
            </button>
            <button
              style={{ ...s.downloadBtn, flex: 1, fontSize: "10px", padding: "6px 8px" }}
              onClick={() => window.open("https://github.com/xxcvv2/nova/releases/latest", "_blank")}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,100,0.08)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
            >
              ↓ Nova
            </button>
          </div>
        </div>
      </div>

      <main style={s.main}>{children}</main>
    </div>
  );
}
