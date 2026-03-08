import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type MutableRefObject,
} from "react";
import { encryptGroupMessage } from "@null/core/messaging";
import type { PeerManager } from "@null/core/p2p";
import { useApp } from "../context/AppContext.js";
import type { LocalMessage, FileRef } from "../context/reducer.js";

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  pmRef: MutableRefObject<PeerManager | null>;
}

// ── Disappearing timer options ──────────────────────────────────────────────

const TIMER_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: "Off",     value: undefined },
  { label: "1 hour",  value: 60 * 60 * 1000 },
  { label: "24 hours",value: 24 * 60 * 60 * 1000 },
  { label: "7 days",  value: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", value: 30 * 24 * 60 * 60 * 1000 },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

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

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function formatTimerLabel(ms: number | undefined): string {
  if (!ms) return "Off";
  const opt = TIMER_OPTIONS.find((o) => o.value === ms);
  if (opt) return opt.label;
  return formatTimeRemaining(ms);
}

// ── Inline group message bubble ─────────────────────────────────────────────

interface BubbleProps {
  message: LocalMessage;
  isMine: boolean;
  senderLabel: string | null; // null if isMine
  now: number;
}

function GroupMessageBubble({ message, isMine, senderLabel, now }: BubbleProps) {
  const dateLabel = formatDate(message.timestamp);
  const isFile = !!message.fileRef;
  const expiresAt = message.expiresAt;
  const timeRemaining = expiresAt ? expiresAt - now : null;
  const isExpired = timeRemaining !== null && timeRemaining <= 0;

  if (message.disappeared || isExpired) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", marginBottom: "10px" }}>
        <div style={{ fontSize: "11px", color: "#333", fontStyle: "italic", padding: "6px 12px", border: "1px solid #1a1a1a", borderRadius: "2px" }}>
          [ message disappeared ]
        </div>
        <div style={{ fontSize: "10px", color: "#2a2a2a", marginTop: "3px" }}>{formatTime(message.timestamp)}</div>
      </div>
    );
  }

  const STATUS_SYMBOL = {
    pending:   { symbol: "○", color: "var(--muted)" },
    delivered: { symbol: "✓", color: "#00cc33" },
    failed:    { symbol: "✗", color: "#cc3333" },
  } as const;
  const statusInfo = STATUS_SYMBOL[message.status];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isMine ? "flex-end" : "flex-start",
        marginBottom: "10px",
      }}
    >
      {/* Date separator */}
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

      {/* Sender label (only for others) */}
      {!isMine && senderLabel && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--green-dim)",
            marginBottom: "3px",
            paddingLeft: "2px",
          }}
        >
          {senderLabel}
        </div>
      )}

      {/* Bubble */}
      <div
        style={{
          background: isMine ? "rgba(0,255,65,0.08)" : "var(--surface)",
          border: `1px solid ${isMine ? "rgba(0,255,65,0.25)" : "var(--border)"}`,
          borderRadius: "4px",
          padding: isFile ? "10px 12px" : "8px 12px",
          maxWidth: isFile ? "320px" : "72%",
          wordBreak: "break-word",
          fontSize: "13px",
          color: isMine ? "var(--green)" : "var(--text)",
          lineHeight: 1.5,
          userSelect: "text",
        }}
      >
        {isFile ? (
          <FileAttachmentContent fileRef={message.fileRef!} />
        ) : (
          message.content
        )}
      </div>

      {/* Timestamp row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "10px",
          color: "var(--muted)",
          marginTop: "3px",
        }}
      >
        <span>{formatTime(message.timestamp)}</span>
        {isMine && (
          <span style={{ color: statusInfo.color }} title={message.status}>
            {statusInfo.symbol}
          </span>
        )}
        {timeRemaining !== null && timeRemaining > 0 && (
          <span style={{ color: "#ffaa00" }} title="Disappears soon">
            ⏱ {formatTimeRemaining(timeRemaining)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── File attachment display ─────────────────────────────────────────────────

function FileAttachmentContent({ fileRef }: { fileRef: FileRef }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "18px", lineHeight: 1 }}>📄</span>
      <div>
        <div style={{ fontSize: "13px", color: "var(--green)" }}>{fileRef.fileName}</div>
        <div style={{ fontSize: "10px", color: "var(--muted)" }}>
          {formatBytes(fileRef.totalSize)}
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function GroupConversationPage({ pmRef }: Props) {
  const { state, dispatch } = useApp();

  const groupId = state.currentGroupId;
  const group = groupId ? state.groups[groupId] : null;
  const conv = groupId ? state.groupConversations[groupId] : null;
  const messages = conv?.messages ?? [];
  const disappearAfterMs = conv?.disappearAfterMs;

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [showTimerDropdown, setShowTimerDropdown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live clock for expiry countdowns — ticks every second
  const [now, setNow] = useState(() => Date.now());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    if (!groupId) return;
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      const toExpire = messagesRef.current.filter(
        (m) => m.expiresAt && m.expiresAt <= ts && !m.disappeared
      );
      if (toExpire.length > 0) {
        dispatch({ type: "EXPIRE_GROUP_MESSAGES", groupId });
        for (const m of toExpire) {
          void window.nullBridge.storage.put(
            `gmsg:${groupId}:${String(m.timestamp).padStart(16, "0")}:${m.id}`,
            JSON.stringify({ ...m, content: "", fileRef: undefined, disappeared: true })
          );
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [groupId, dispatch]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Close timer dropdown on outside click
  useEffect(() => {
    if (!showTimerDropdown) return;
    function handleClick() { setShowTimerDropdown(false); }
    window.addEventListener("click", handleClick, { capture: true, once: true });
    return () => window.removeEventListener("click", handleClick, { capture: true });
  }, [showTimerDropdown]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const memberCount = group?.memberAddresses.length ?? 0;

  function getMemberLabel(address: string): string {
    const contact = state.contacts[address];
    if (contact?.nickname) return contact.nickname;
    return truncateAddress(address);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleBack() {
    dispatch({ type: "SET_SCREEN", screen: "home" });
  }

  function handleLeaveGroup() {
    if (!groupId) return;
    if (!window.confirm(`Leave "${group?.name ?? "this group"}"? You will no longer receive messages.`)) return;
    dispatch({ type: "REMOVE_GROUP", groupId });
    dispatch({ type: "SET_SCREEN", screen: "home" });
  }

  function handleSetTimer(value: number | undefined) {
    if (!groupId || !group) return;
    dispatch({ type: "SET_GROUP_DISAPPEAR_TIMER", groupId, disappearAfterMs: value });
    // Persist timer setting
    if (value !== undefined) {
      void window.nullBridge.storage.put(`group-meta:${groupId}`, JSON.stringify({ disappearAfterMs: value }));
    } else {
      void window.nullBridge.storage.del(`group-meta:${groupId}`);
    }
    // Sync to all group members via wire message
    const wire = JSON.stringify({ type: "disappear-timer-group", groupId, disappearAfterMs: value ?? null });
    for (const memberAddress of group.memberAddresses) {
      if (memberAddress === state.wallet?.address) continue;
      pmRef.current?.sendTo(memberAddress, wire);
    }
    setShowTimerDropdown(false);
  }

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const content = draft.trim();
      if (!content || sending || !groupId || !group || !state.wallet) return;

      setDraft("");
      setSending(true);

      try {
        const messageId = crypto.randomUUID();
        const timestamp = Date.now();

        const { ciphertext, iv } = await encryptGroupMessage(content, group.groupKeyHex);

        const local: LocalMessage = {
          id: messageId,
          fromAddress: state.wallet.address,
          toAddress: groupId,
          content,
          timestamp,
          status: "pending",
          ...(disappearAfterMs !== undefined ? { expiresAt: timestamp + disappearAfterMs } : {}),
        };

        dispatch({ type: "SEND_GROUP_MESSAGE", groupId, message: local });

        // Persist to storage
        void window.nullBridge.storage.put(
          `gmsg:${groupId}:${String(timestamp).padStart(16, "0")}:${messageId}`,
          JSON.stringify(local)
        );

        // Send encrypted message to each group member via PeerManager
        const wirePayload = JSON.stringify({
          type: "group-msg",
          groupId,
          messageId,
          fromAddress: state.wallet.address,
          ciphertext,
          iv,
          timestamp,
          ...(disappearAfterMs !== undefined ? { expiresIn: disappearAfterMs } : {}),
        });

        for (const memberAddress of group.memberAddresses) {
          if (memberAddress === state.wallet.address) continue;
          const sent = pmRef.current?.sendTo(memberAddress, wirePayload) ?? false;
          if (!sent) {
            void pmRef.current?.connectToPeer(memberAddress);
          }
        }

        dispatch({
          type: "UPDATE_GROUP_MESSAGE_STATUS",
          groupId,
          messageId,
          status: "delivered",
        });
      } catch (err) {
        console.error("Group send failed:", err);
      } finally {
        setSending(false);
        textareaRef.current?.focus();
      }
    },
    [draft, sending, groupId, group, state.wallet, disappearAfterMs, dispatch, pmRef]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(e as unknown as FormEvent);
    }
  }

  function handleAttachClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      // TODO: Implement group file transfers (wired up via P2P layer)
      console.log("Group file attach selected:", file.name, "— P2P group file transfer not yet wired.");
      alert("File transfers in groups will be available once group P2P routing is complete.");
    }
  }

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!groupId || !group) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: "13px" }}>
        No group selected.
      </div>
    );
  }

  // ── Peer connectivity summary ─────────────────────────────────────────────

  const otherMembers = group.memberAddresses.filter((a) => a !== state.wallet?.address);
  const onlineCount = otherMembers.filter((a) => state.peerStatuses[a] === "connected").length;
  const notAllOnline = onlineCount < otherMembers.length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      {/* ── Header ── */}
      <div
        style={{
          height: "48px",
          minHeight: "48px",
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          background: "var(--bg)",
        }}
      >
        {/* Left side */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={handleBack}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "16px",
              padding: "0 4px",
              lineHeight: 1,
              fontFamily: "monospace",
            }}
            title="Back to home"
          >
            ←
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            <span
              style={{
                fontSize: "13px",
                color: "var(--green)",
                fontWeight: "bold",
                fontFamily: "monospace",
              }}
            >
              {group.name}
            </span>
            <span
              style={{
                fontSize: "10px",
                color: "var(--muted)",
                fontFamily: "monospace",
              }}
            >
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
          </div>
        </div>

        {/* Right side */}
        <button
          onClick={() => setShowMembersPanel((v) => !v)}
          style={{
            background: "transparent",
            border: `1px solid ${showMembersPanel ? "var(--green)" : "var(--border)"}`,
            borderRadius: "2px",
            color: showMembersPanel ? "var(--green)" : "var(--muted)",
            cursor: "pointer",
            fontSize: "13px",
            padding: "4px 10px",
            fontFamily: "monospace",
          }}
          title="Group info &amp; members"
        >
          ⓘ info
        </button>
      </div>

      {/* ── Disappearing messages banner ── */}
      {disappearAfterMs && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "6px 16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexShrink: 0,
            background: "rgba(255,170,0,0.05)",
            position: "relative",
          }}
        >
          <span style={{ fontSize: "11px", color: "#ffaa00", fontFamily: "monospace", flex: 1 }}>
            ⏱ Messages disappear after {formatTimerLabel(disappearAfterMs)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowTimerDropdown((v) => !v); }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "11px",
              fontFamily: "monospace",
              padding: "2px 6px",
            }}
          >
            change ▾
          </button>

          {/* Timer dropdown */}
          {showTimerDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: "0",
                zIndex: 100,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                minWidth: "140px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {TIMER_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => handleSetTimer(opt.value)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: disappearAfterMs === opt.value ? "rgba(0,255,65,0.08)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    color: disappearAfterMs === opt.value ? "var(--green)" : "var(--text)",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    padding: "8px 12px",
                  }}
                >
                  {opt.value === undefined && disappearAfterMs === undefined ? "● " : disappearAfterMs === opt.value ? "● " : "  "}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Body: messages + optional members panel ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>

        {/* ── Messages area ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            padding: "16px 20px",
          }}
        >
          {/* Screenshot warning banner (if disappearing messages on) */}
          {disappearAfterMs && (
            <div
              style={{
                background: "rgba(255,170,0,0.06)",
                border: "1px solid rgba(255,170,0,0.2)",
                borderRadius: "4px",
                padding: "7px 12px",
                marginBottom: "16px",
                fontSize: "11px",
                color: "#cc8800",
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              ⚠ Screenshots not detected — be mindful
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted)",
                fontSize: "12px",
                fontFamily: "monospace",
                textAlign: "center",
              }}
            >
              No messages yet. Say hello to the group.
            </div>
          )}

          {/* Message list */}
          {messages.map((msg) => {
            const isMine = msg.fromAddress === state.wallet?.address;
            const senderLabel = isMine ? null : getMemberLabel(msg.fromAddress);
            return (
              <GroupMessageBubble
                key={msg.id}
                message={msg}
                isMine={isMine}
                senderLabel={senderLabel}
                now={now}
              />
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Members panel (slides in from right) ── */}
        {showMembersPanel && (
          <div
            style={{
              width: "240px",
              minWidth: "240px",
              borderLeft: "1px solid var(--border)",
              background: "var(--surface)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  fontFamily: "monospace",
                }}
              >
                Members
              </span>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--muted)",
                  fontFamily: "monospace",
                }}
              >
                {memberCount}
              </span>
            </div>

            {/* Member list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {group.memberAddresses.map((address) => {
                const isAdmin = address === group.adminAddress;
                const isSelf = address === state.wallet?.address;
                const contact = state.contacts[address];
                const nickname = contact?.nickname;
                const peerStatus = state.peerStatuses[address];

                return (
                  <div
                    key={address}
                    style={{
                      padding: "8px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                      borderBottom: "1px solid rgba(34,34,34,0.5)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {/* Online dot */}
                      <span
                        style={{
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          flexShrink: 0,
                          background:
                            isSelf
                              ? "var(--green)"
                              : peerStatus === "connected"
                              ? "var(--green)"
                              : peerStatus === "connecting"
                              ? "#ffaa00"
                              : "#444",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "12px",
                          color: isAdmin ? "var(--green)" : "var(--text)",
                          fontFamily: "monospace",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {nickname ?? truncateAddress(address)}
                        {isSelf && (
                          <span style={{ color: "var(--muted)", fontSize: "10px" }}> (you)</span>
                        )}
                      </span>
                      {isAdmin && (
                        <span
                          style={{
                            fontSize: "9px",
                            color: "var(--green)",
                            border: "1px solid rgba(0,255,65,0.3)",
                            borderRadius: "2px",
                            padding: "1px 4px",
                            fontFamily: "monospace",
                            flexShrink: 0,
                          }}
                          title="Group admin"
                        >
                          ◆ admin
                        </span>
                      )}
                    </div>
                    {/* Address line */}
                    <span
                      style={{
                        fontSize: "10px",
                        color: "var(--muted)",
                        fontFamily: "monospace",
                        paddingLeft: "11px",
                      }}
                    >
                      {truncateAddress(address)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Disappearing timer setting inside panel */}
            <div
              style={{
                borderTop: "1px solid var(--border)",
                padding: "10px 16px",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  fontFamily: "monospace",
                  marginBottom: "6px",
                }}
              >
                Disappearing messages
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {TIMER_OPTIONS.map((opt) => {
                  const isActive = disappearAfterMs === opt.value;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => handleSetTimer(opt.value)}
                      style={{
                        background: isActive ? "rgba(0,255,65,0.1)" : "transparent",
                        border: `1px solid ${isActive ? "var(--green)" : "var(--border)"}`,
                        borderRadius: "2px",
                        color: isActive ? "var(--green)" : "var(--muted)",
                        cursor: "pointer",
                        fontSize: "10px",
                        fontFamily: "monospace",
                        padding: "3px 7px",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Leave group button */}
            <div
              style={{
                borderTop: "1px solid var(--border)",
                padding: "12px 16px",
                flexShrink: 0,
              }}
            >
              <button
                onClick={handleLeaveGroup}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid #cc3333",
                  borderRadius: "2px",
                  color: "#cc3333",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  padding: "8px 12px",
                }}
              >
                Leave Group
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "8px 16px 12px",
          flexShrink: 0,
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {/* "Not all members online" notice */}
        {notAllOnline && otherMembers.length > 0 && (
          <div
            style={{
              fontSize: "10px",
              color: "var(--muted)",
              fontFamily: "monospace",
            }}
          >
            ○ {onlineCount}/{otherMembers.length} members online — messages will deliver when they reconnect
          </div>
        )}

        {/* Input row */}
        <form
          onSubmit={(e) => { void handleSend(e); }}
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
          }}
        >
          {/* Attach button */}
          <button
            type="button"
            onClick={handleAttachClick}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "2px",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "16px",
              padding: "5px 8px",
              alignSelf: "flex-end",
              flexShrink: 0,
              lineHeight: 1,
              fontFamily: "monospace",
            }}
            title="Attach a file"
          >
            📎
          </button>

          {/* Text area */}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sending ? "Sending…" : "Type a message to the group…"}
            disabled={sending}
            rows={1}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "2px",
              color: "var(--green)",
              fontSize: "13px",
              fontFamily: "monospace",
              padding: "8px 12px",
              flex: 1,
              outline: "none",
              resize: "none",
              height: "auto",
              minHeight: "38px",
              maxHeight: "120px",
            }}
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            style={{
              background: "transparent",
              border: "1px solid var(--green)",
              borderRadius: "2px",
              color: !draft.trim() || sending ? "var(--muted)" : "var(--green)",
              borderColor: !draft.trim() || sending ? "var(--border)" : "var(--green)",
              cursor: !draft.trim() || sending ? "default" : "pointer",
              fontSize: "12px",
              fontFamily: "monospace",
              padding: "8px 16px",
              alignSelf: "flex-end",
              flexShrink: 0,
            }}
          >
            {sending ? "…" : "Send →"}
          </button>
        </form>
      </div>
    </div>
  );
}
