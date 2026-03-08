import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.js";
import type { CallFunctions } from "../hooks/usePeerManager.js";

interface Props {
  call: CallFunctions;
}

const GREEN = "#00FF41";
const MUTED = "#555";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function CallOverlay({ call }: Props) {
  const { state } = useApp();
  const cs = state.call;

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (cs.status !== "active") { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed(Date.now() - cs.startedAt), 1000);
    return () => clearInterval(interval);
  }, [cs.status, cs.status === "active" ? cs.startedAt : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cs.status === "idle") return null;

  const peerShort = `${cs.peerAddress.slice(0, 8)}…${cs.peerAddress.slice(-6)}`;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#0a0a0a",
    border: `1px solid ${GREEN}`,
    borderRadius: "4px",
    padding: "12px 18px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    zIndex: 1000,
    fontFamily: "var(--font)",
    fontSize: "12px",
    color: GREEN,
    boxShadow: `0 0 20px rgba(0,255,65,0.15)`,
    minWidth: "300px",
  };

  const btn = (label: string, onClick: () => void, danger = false): React.ReactElement => (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: `1px solid ${danger ? "#cc3333" : GREEN}`,
        borderRadius: "2px",
        color: danger ? "#cc3333" : GREEN,
        cursor: "pointer",
        fontSize: "11px",
        padding: "4px 10px",
        fontFamily: "var(--font)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  // Hidden audio element for remote stream
  const remoteAudio = (
    <audio id="null-remote-audio" autoPlay style={{ display: "none" }} />
  );

  if (cs.status === "incoming") {
    return (
      <>
        {remoteAudio}
        <div style={overlayStyle}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              incoming {cs.video ? "video" : "voice"} call
            </div>
            <div style={{ marginTop: "3px" }}>{peerShort}</div>
          </div>
          {btn(cs.video ? "📷 Answer" : "🎤 Answer", () => call.answer(cs.video))}
          {btn("Reject", call.reject, true)}
        </div>
      </>
    );
  }

  if (cs.status === "outgoing") {
    return (
      <>
        {remoteAudio}
        <div style={overlayStyle}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: MUTED, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              calling…
            </div>
            <div style={{ marginTop: "3px" }}>{peerShort}</div>
          </div>
          {btn("Cancel", call.end, true)}
        </div>
      </>
    );
  }

  // active
  const muted = cs.muted;
  const cameraOff = cs.cameraOff;

  return (
    <>
      {remoteAudio}
      <div style={overlayStyle}>
        <div style={{ fontSize: "11px", color: MUTED, minWidth: "42px" }}>
          {formatDuration(elapsed)}
        </div>
        <div style={{ flex: 1, fontSize: "11px" }}>{peerShort}</div>
        {btn(muted ? "🔇 Muted" : "🎙 Mute", call.toggleMute)}
        {cs.video && btn(cameraOff ? "📵 Cam off" : "📷 Cam", call.toggleCamera)}
        {btn("End", call.end, true)}
      </div>
    </>
  );
}
