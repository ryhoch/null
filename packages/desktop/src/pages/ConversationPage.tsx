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
import { msgStorageKey, wrapEnvelope, type CallFunctions } from "../hooks/usePeerManager.js";

interface Props {
  contactAddress: string;
  pmRef: MutableRefObject<PeerManager | null>;
  call: CallFunctions;
}

const TIMER_OPTIONS: { label: string; ms: number | undefined }[] = [
  { label: "Off",     ms: undefined },
  { label: "1 hour",  ms: 60 * 60 * 1000 },
  { label: "24 hours",ms: 24 * 60 * 60 * 1000 },
  { label: "7 days",  ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

const STATUS_COLORS = {
  connected: "#00ff41",
  connecting: "#ffaa00",
  disconnected: "#555555",
} as const;

const s = {
  page:        { display: "flex", flexDirection: "column" as const, height: "100%" },
  header:      { padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 },
  headerLeft:  { display: "flex", alignItems: "center", gap: "10px" },
  back:        { background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "13px", padding: 0 },
  contactName: { fontSize: "13px", color: "var(--green)", fontWeight: "bold" as const },
  statusDot:   { width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0 },
  headerActions:{ display: "flex", gap: "8px" },
  actionBtn:   { background: "transparent", border: "1px solid var(--border)", borderRadius: "2px", color: "var(--muted)", cursor: "pointer", fontSize: "11px", padding: "4px 10px" },
  timerBadge:  { fontSize: "9px", color: "#ffaa00", border: "1px solid #ffaa00", borderRadius: "2px", padding: "2px 6px", letterSpacing: "0.05em" },
  messages:    { flex: 1, overflowY: "auto" as const, padding: "16px 20px", display: "flex", flexDirection: "column" as const },
  inputBar:    { borderTop: "1px solid var(--border)", padding: "12px 20px", display: "flex", gap: "8px", flexShrink: 0, flexDirection: "column" as const },
  inputRow:    { display: "flex", gap: "8px", alignItems: "flex-end" },
  input:       { background: "transparent", border: "1px solid var(--border)", borderRadius: "2px", color: "var(--green)", fontSize: "13px", fontFamily: "var(--font)", padding: "8px 12px", flex: 1, outline: "none", resize: "none" as const },
  sendBtn:     { background: "transparent", border: "1px solid var(--green)", borderRadius: "2px", color: "var(--green)", cursor: "pointer", fontSize: "12px", padding: "8px 16px", alignSelf: "flex-end" as const },
  attachBtn:   { background: "transparent", border: "1px solid var(--border)", borderRadius: "2px", color: "var(--muted)", cursor: "pointer", fontSize: "16px", padding: "5px 8px", alignSelf: "flex-end" as const, flexShrink: 0, lineHeight: 1 },
  progressBar: { fontSize: "11px", color: "var(--muted)", padding: "2px 0" },
  errorText:   { fontSize: "11px", color: "var(--red)", padding: "2px 0" },
  qrPanel:     { borderTop: "1px solid var(--border)", padding: "24px", display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, background: "var(--bg-surface)" },
  editPanel:   { borderTop: "1px solid var(--border)", padding: "16px 20px", display: "flex", flexDirection: "column" as const, gap: "12px", flexShrink: 0, background: "var(--bg-surface)" },
  editPanelTitle:{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.15em" },
  editRow:     { display: "flex", gap: "8px", alignItems: "center" },
  editInput:   { background: "transparent", border: "1px solid var(--border)", borderRadius: "2px", color: "var(--green)", fontSize: "13px", fontFamily: "var(--font)", padding: "6px 10px", flex: 1, outline: "none" },
  saveBtn:     { background: "transparent", border: "1px solid var(--green)", borderRadius: "2px", color: "var(--green)", cursor: "pointer", fontSize: "11px", padding: "6px 12px" },
  dangerBtn:   { background: "transparent", border: "1px solid var(--red)", borderRadius: "2px", color: "var(--red)", cursor: "pointer", fontSize: "11px", padding: "6px 12px" },
  dangerRow:   { display: "flex", gap: "8px", paddingTop: "4px", borderTop: "1px solid var(--border)" },
  timerRow:    { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" as const },
  timerLabel:  { fontSize: "10px", color: "var(--muted)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginRight: "4px" },
  // Recording
  recordingRow:{ display: "flex", gap: "8px", alignItems: "center", flex: 1 },
  recDot:      { width: "8px", height: "8px", borderRadius: "50%", background: "#ff4444", flexShrink: 0 },
  recTime:     { fontSize: "12px", color: "#ff4444", fontFamily: "var(--font)", flex: 1 },
  cancelBtn:   { background: "transparent", border: "1px solid var(--red)", borderRadius: "2px", color: "var(--red)", cursor: "pointer", fontSize: "11px", padding: "6px 12px", alignSelf: "flex-end" as const },
};

function formatRecordingDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ConversationPage({ contactAddress, pmRef, call }: Props) {
  const { state, dispatch, getPrivateKey } = useApp();

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [fileProgress, setFileProgress] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDurationMs, setRecordDurationMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformSamplesRef = useRef<number[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartRef = useRef(0);
  const isCancelledRef = useRef(false);
  const micBtnRef = useRef<HTMLButtonElement>(null);
  const recordStartPosRef = useRef({ x: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contact = state.contacts[contactAddress];
  const conversation = state.conversations[contactAddress];
  const messages = conversation?.messages ?? [];
  const disappearAfterMs = conversation?.disappearAfterMs;
  const peerStatus = state.peerStatuses[contactAddress];
  const statusColor = STATUS_COLORS[peerStatus ?? "disconnected"];

  const label =
    contact?.nickname ??
    `${contactAddress.slice(0, 6)}…${contactAddress.slice(-4)}`;

  // Keep a ref so the expiry interval doesn't go stale
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ── Expiry interval ────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const toExpire = messagesRef.current.filter(
        (m) => m.expiresAt && m.expiresAt <= now && !m.disappeared
      );
      if (toExpire.length === 0) return;
      dispatch({ type: "EXPIRE_MESSAGES", contactAddress });
      for (const m of toExpire) {
        void window.nullBridge.storage.put(
          msgStorageKey(contactAddress, m.timestamp, m.id),
          JSON.stringify({ ...m, content: "", fileRef: undefined, disappeared: true })
        );
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [contactAddress, dispatch]);

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Timer label helper ─────────────────────────────────────────────────────
  function timerLabel(ms: number | undefined): string {
    if (!ms) return "";
    const opt = TIMER_OPTIONS.find((o) => o.ms === ms);
    return opt ? opt.label : `${ms / 1000}s`;
  }

  // ── Disappear timer ────────────────────────────────────────────────────────
  async function handleSetTimer(ms: number | undefined) {
    dispatch({ type: "SET_DISAPPEAR_TIMER", contactAddress, disappearAfterMs: ms });
    if (ms !== undefined) {
      await window.nullBridge.storage.put(`conv-meta:${contactAddress}`, JSON.stringify({ disappearAfterMs: ms }));
    } else {
      await window.nullBridge.storage.del(`conv-meta:${contactAddress}`);
    }
    // Sync to peer
    const pm = pmRef.current;
    if (pm) {
      const wire = JSON.stringify({ type: "disappear-timer", disappearAfterMs: ms ?? null });
      pm.sendTo(contactAddress, wire);
    }
  }

  // ── Edit panel ─────────────────────────────────────────────────────────────
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
    if (!window.confirm("Clear all messages? This cannot be undone.")) return;
    dispatch({ type: "CLEAR_CONVERSATION", address: contactAddress });
    const rows = await window.nullBridge.storage.list(`msg:${contactAddress}:`);
    for (const row of rows) await window.nullBridge.storage.del(row.key);
    setShowEdit(false);
  }

  async function handleDeleteConversation() {
    if (!window.confirm("Delete conversation and remove contact?")) return;
    const rows = await window.nullBridge.storage.list(`msg:${contactAddress}:`);
    for (const row of rows) await window.nullBridge.storage.del(row.key);
    await window.nullBridge.storage.del(`contact:${contactAddress}`);
    dispatch({ type: "REMOVE_CONTACT", address: contactAddress });
    dispatch({ type: "DELETE_CONVERSATION", address: contactAddress });
  }

  // ── Message send ───────────────────────────────────────────────────────────
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
      dispatch({ type: "UPDATE_MESSAGE_STATUS", contactAddress, messageId: encrypted.id, status: "delivered" });
      await window.nullBridge.storage.put(
        msgStorageKey(contactAddress, encrypted.timestamp, encrypted.id),
        JSON.stringify({ ...local, status: "delivered" })
      );
    } else {
      const queueEntry = { id: encrypted.id, encryptedPayload: wirePayload, recipientAddress: contactAddress, timestamp: Date.now(), attempts: 0, nextRetryAt: Date.now() };
      await window.nullBridge.storage.put(`queue:${contactAddress}:${encrypted.id}`, JSON.stringify(queueEntry));
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

  // ── File send ──────────────────────────────────────────────────────────────
  function handleAttachClick() {
    setFileError(null);
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void sendFile(file);
  }

  async function sendFile(
    file: File,
    extra?: { voiceDuration?: number; waveform?: number[] }
  ) {
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
        ...(extra?.voiceDuration !== undefined ? { voiceDuration: extra.voiceDuration } : {}),
        ...(extra?.waveform !== undefined ? { waveform: extra.waveform } : {}),
      },
    };
    dispatch({ type: "SEND_MESSAGE", contactAddress, message: local });

    const storedFileRef = {
      transferId, fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      totalSize: file.size, totalChunks,
      ...(extra?.voiceDuration !== undefined ? { voiceDuration: extra.voiceDuration } : {}),
      ...(extra?.waveform !== undefined ? { waveform: extra.waveform } : {}),
    };
    await window.nullBridge.storage.put(
      msgStorageKey(contactAddress, meta.timestamp, transferId),
      JSON.stringify({ ...local, fileRef: storedFileRef })
    );

    let b64 = "";
    for (let i = 0; i < fileBytes.byteLength; i++) b64 += String.fromCharCode(fileBytes[i]!);
    await window.nullBridge.storage.put(`file:${contactAddress}:${transferId}`, btoa(b64));

    try {
      if (!pm.sendTo(contactAddress, JSON.stringify(meta as FileMetaChunk))) throw new Error("Peer disconnected");

      const BACKPRESSURE_THRESHOLD = 128 * 1024;
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const chunk = fileBytes.slice(start, Math.min(start + CHUNK_SIZE, fileBytes.byteLength));

        let waited = 0;
        while (pm.getBufferedAmount(contactAddress) > BACKPRESSURE_THRESHOLD) {
          await new Promise((r) => setTimeout(r, 20));
          waited += 20;
          if (waited > 30_000) throw new Error("Send timeout — peer may have disconnected");
        }

        const { data, iv } = await encryptFileChunk(key, chunk);
        const chunkMsg: FileDataChunk = { type: "file-chunk", transferId, index: i + 1, data, iv };
        if (!pm.sendTo(contactAddress, JSON.stringify(chunkMsg))) throw new Error("Peer disconnected during transfer");

        await new Promise((r) => setTimeout(r, 8));
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
      setFileError(err instanceof Error ? err.message : "File send failed — try again.");
    } finally {
      setFileProgress(null);
    }
  }

  // ── Voice recording ────────────────────────────────────────────────────────
  async function startRecording(startX: number) {
    if (isRecording) return;
    isCancelledRef.current = false;
    recordStartPosRef.current.x = startX;
    waveformSamplesRef.current = [];
    recordedChunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setFileError("Microphone access denied.");
      return;
    }

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const mr = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
      if (isCancelledRef.current) return;
      const durationMs = Date.now() - recordStartRef.current;
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      void sendVoiceNote(blob, waveformSamplesRef.current, durationMs);
    };

    mr.start(100);
    recordStartRef.current = Date.now();
    setIsRecording(true);
    setRecordDurationMs(0);

    recordTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - recordStartRef.current;
      setRecordDurationMs(elapsed);

      if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const amp = data.reduce((a, b) => a + b, 0) / data.length / 255;
        waveformSamplesRef.current.push(amp);
      }

      if (elapsed >= 5 * 60 * 1000) stopRecording(false);
    }, 100);
  }

  function stopRecording(cancel: boolean) {
    isCancelledRef.current = cancel;
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    analyserRef.current = null;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordDurationMs(0);
  }

  async function sendVoiceNote(blob: Blob, waveform: number[], durationMs: number) {
    if (peerStatus !== "connected") {
      setFileError("Voice notes can only be sent to online contacts.");
      return;
    }
    const maxAmp = Math.max(...waveform, 0.001);
    const normalizedWaveform = waveform.map((v) => v / maxAmp);
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
    await sendFile(file, { voiceDuration: durationMs, waveform: normalizedWaveform });
  }

  function handleMicPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (isRecording || !contact || peerStatus !== "connected") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    void startRecording(e.clientX);
  }

  function handleMicPointerUp(_e: React.PointerEvent<HTMLButtonElement>) {
    if (!isRecording) return;
    stopRecording(false);
  }

  function handleMicPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!isRecording) return;
    if (e.clientX < recordStartPosRef.current.x - 80) stopRecording(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileInputChange} />

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <button style={s.back} onClick={() => dispatch({ type: "SET_SCREEN", screen: "home" })}>←</button>
          <span style={{ ...s.statusDot, background: statusColor }} />
          <span style={s.contactName}>{label}</span>
          <span style={{ fontSize: "10px", color: peerStatus === "connecting" ? "#ffaa00" : "var(--muted)" }}>
            {peerStatus === "connected" ? contactAddress.slice(0, 10) + "…" : peerStatus === "connecting" ? "connecting…" : "offline"}
          </span>
          {disappearAfterMs !== undefined && (
            <span style={s.timerBadge}>⏱ {timerLabel(disappearAfterMs)}</span>
          )}
        </div>
        <div style={s.headerActions}>
          {contact && (
            <>
              <button
                style={s.actionBtn}
                onClick={() => call.initiate(contactAddress, false)}
                title="Voice call"
              >
                🎤
              </button>
              <button
                style={s.actionBtn}
                onClick={() => call.initiate(contactAddress, true)}
                title="Video call"
              >
                📷
              </button>
              <button
                style={{ ...s.actionBtn, color: showEdit ? "var(--green)" : "var(--muted)" }}
                onClick={openEdit}
                title="Edit contact"
              >
                edit
              </button>
            </>
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

      {/* Edit panel */}
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

          {/* Disappear timer */}
          <div>
            <div style={{ ...s.editPanelTitle, marginBottom: "8px" }}>Disappearing messages</div>
            <div style={s.timerRow}>
              {TIMER_OPTIONS.map((opt) => {
                const active = disappearAfterMs === opt.ms;
                return (
                  <button
                    key={opt.label}
                    onClick={() => void handleSetTimer(opt.ms)}
                    style={{
                      background: active ? "rgba(0,255,65,0.1)" : "transparent",
                      border: `1px solid ${active ? "var(--green)" : "var(--border)"}`,
                      borderRadius: "2px",
                      color: active ? "var(--green)" : "var(--muted)",
                      cursor: "pointer",
                      fontSize: "11px",
                      padding: "4px 10px",
                      fontFamily: "var(--font)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "6px" }}>
              Timer starts when message is delivered. Setting synced to recipient.
            </div>
          </div>

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

      {/* Input bar */}
      <div style={s.inputBar}>
        {fileProgress && <div style={s.progressBar}>{fileProgress}</div>}
        {fileError && <div style={s.errorText}>{fileError}</div>}

        <form onSubmit={handleSend} style={s.inputRow}>
          {/* Attach */}
          <button
            type="button"
            style={s.attachBtn}
            onClick={handleAttachClick}
            disabled={!contact || !!fileProgress || peerStatus !== "connected" || isRecording}
            title={peerStatus !== "connected" ? "Files can only be sent to online contacts" : "Send a file"}
          >
            📎
          </button>

          {/* Payment */}
          <button
            type="button"
            style={{ ...s.attachBtn, color: showPayment ? "var(--green)" : "var(--muted)", borderColor: showPayment ? "var(--green)" : "var(--border)" }}
            onClick={() => { setShowPayment((v) => !v); setShowQR(false); setShowEdit(false); }}
            disabled={!contact || isRecording}
            title="Send a payment on Base"
          >
            $
          </button>

          {/* Mic / recording */}
          {isRecording ? (
            <div style={{ ...s.recordingRow }}>
              <div style={{ ...s.recDot, animation: "pulse 1s infinite" }} />
              <span style={s.recTime}>{formatRecordingDuration(recordDurationMs)} ← slide left to cancel</span>
              <button
                type="button"
                style={s.cancelBtn}
                onClick={() => stopRecording(true)}
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <button
                ref={micBtnRef}
                type="button"
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onPointerMove={handleMicPointerMove}
                disabled={!contact || peerStatus !== "connected" || !!fileProgress}
                title="Hold to record voice note"
                style={{
                  ...s.attachBtn,
                  color: peerStatus === "connected" && contact ? "var(--muted)" : "#333",
                  fontSize: "14px",
                  touchAction: "none",
                }}
              >
                🎤
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
              <button type="submit" disabled={!draft.trim() || sending || !contact} style={s.sendBtn}>
                Send
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
