import { useState } from "react";
import { ConversationItem } from "../components/ConversationItem.js";
import { useApp } from "../context/AppContext.js";
import type { PendingContactRequest } from "../context/reducer.js";

const s = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  header: {
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: "13px",
    letterSpacing: "0.2em",
    color: "var(--muted)",
    textTransform: "uppercase" as const,
  },
  btn: {
    background: "transparent",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "12px",
    padding: "6px 14px",
  },
  copyBtn: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "12px",
    padding: "6px 14px",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  copiedLabel: {
    fontSize: "11px",
    color: "var(--green-dim)",
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
  },
  empty: {
    padding: "40px 20px",
    textAlign: "center" as const,
    color: "var(--muted)",
    fontSize: "12px",
    lineHeight: 2,
  },
  requestBanner: {
    borderBottom: "1px solid #ffaa0044",
    background: "#ffaa0011",
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  },
  requestLabel: {
    fontSize: "10px",
    color: "#ffaa00",
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
  },
  requestRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  requestAddress: {
    fontSize: "12px",
    color: "var(--green)",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  requestActions: {
    display: "flex",
    gap: "6px",
    flexShrink: 0,
  },
  acceptBtn: {
    background: "transparent",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "11px",
    padding: "4px 10px",
  },
  dismissBtn: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "11px",
    padding: "4px 10px",
  },
};

interface ContactRequestBannerProps {
  request: PendingContactRequest;
  onAccept: () => void;
  onDismiss: () => void;
}

function ContactRequestBanner({ request, onAccept, onDismiss }: ContactRequestBannerProps) {
  const short = `${request.address.slice(0, 10)}…${request.address.slice(-6)}`;
  return (
    <div style={s.requestBanner}>
      <div style={s.requestLabel}>Contact Request</div>
      <div style={s.requestRow}>
        <span style={s.requestAddress} title={request.address}>
          {short} wants to message you
        </span>
        <div style={s.requestActions}>
          <button style={s.acceptBtn} onClick={onAccept}>Accept</button>
          <button style={s.dismissBtn} onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const { state, dispatch } = useApp();
  const [copied, setCopied] = useState(false);

  const sorted = Object.values(state.conversations).sort(
    (a, b) => b.lastActivity - a.lastActivity
  );

  const sortedGroups = Object.values(state.groupConversations).sort(
    (a, b) => b.lastActivity - a.lastActivity
  );

  // Contacts that haven't been messaged yet
  const newContacts = Object.values(state.contacts).filter(
    (c) => !state.conversations[c.address]
  );

  const pendingRequests = Object.values(state.pendingContactRequests);

  async function handleCopyLink() {
    if (!state.wallet) return;
    const link = `null://connect?address=${state.wallet.address}&pubkey=${state.wallet.pubkeyHex}`;
    await window.nullBridge.system.copyToClipboard(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleAccept(req: PendingContactRequest) {
    // Add as contact using the pubkey they sent us
    const contact = { address: req.address, pubkeyHex: req.pubkeyHex };
    void window.nullBridge.storage.put(
      `contact:${req.address}`,
      JSON.stringify({ ...contact, addedAt: Date.now() })
    );
    dispatch({ type: "ADD_CONTACT", contact });
    dispatch({ type: "DISMISS_PENDING_REQUEST", address: req.address });
    // Open the conversation so they can see the message that already arrived
    dispatch({ type: "OPEN_CONVERSATION", contactAddress: req.address });
  }

  function handleDismiss(address: string) {
    dispatch({ type: "DISMISS_PENDING_REQUEST", address });
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>Conversations</div>
        <div style={s.headerActions}>
          {copied && <span style={s.copiedLabel}>copied!</span>}
          <button style={s.copyBtn} onClick={handleCopyLink} title="Copy your share link to clipboard">
            share my link
          </button>
          <button
            style={s.copyBtn}
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "create-group" })}
          >
            + Group
          </button>
          <button
            style={s.btn}
            onClick={() => dispatch({ type: "SET_SCREEN", screen: "add-contact" })}
          >
            + Add contact
          </button>
        </div>
      </div>

      {/* Pending contact requests */}
      {pendingRequests.map((req) => (
        <ContactRequestBanner
          key={req.address}
          request={req}
          onAccept={() => handleAccept(req)}
          onDismiss={() => handleDismiss(req.address)}
        />
      ))}

      <div style={s.list}>
        {sorted.map((conv) => (
          <ConversationItem
            key={conv.contactAddress}
            conversation={conv}
            contact={state.contacts[conv.contactAddress]}
            isActive={state.currentContactAddress === conv.contactAddress}
            peerStatus={state.peerStatuses[conv.contactAddress]}
            unreadCount={state.unreadCounts[conv.contactAddress] ?? 0}
            onClick={() =>
              dispatch({
                type: "OPEN_CONVERSATION",
                contactAddress: conv.contactAddress,
              })
            }
          />
        ))}

        {newContacts.map((c) => (
          <button
            key={c.address}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--border)",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "12px",
              fontFamily: "var(--font)",
              padding: "12px 16px",
              textAlign: "left" as const,
              width: "100%",
              display: "flex",
              flexDirection: "column" as const,
              gap: "2px",
            }}
            onClick={() => dispatch({ type: "OPEN_CONVERSATION", contactAddress: c.address })}
          >
            <span style={{ color: "var(--green)" }}>
              {c.nickname ?? `${c.address.slice(0, 8)}…${c.address.slice(-4)}`}
            </span>
            <span style={{ fontSize: "10px" }}>no messages yet — click to start</span>
          </button>
        ))}

        {/* Group conversations */}
        {sortedGroups.map((gc) => {
          const group = state.groups[gc.groupId];
          if (!group) return null;
          const lastMsg = gc.messages[gc.messages.length - 1];
          const unread = state.unreadCounts[gc.groupId] ?? 0;
          const isActive = state.currentGroupId === gc.groupId && state.screen === "group-conversation";
          return (
            <button
              key={gc.groupId}
              style={{
                background: isActive ? "var(--bg-surface-2)" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--border)",
                color: "var(--muted)",
                cursor: "pointer",
                fontSize: "12px",
                fontFamily: "var(--font)",
                padding: "12px 16px",
                textAlign: "left" as const,
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
              onClick={() => dispatch({ type: "OPEN_GROUP", groupId: gc.groupId })}
            >
              <div style={{
                width: "28px",
                height: "28px",
                borderRadius: "4px",
                background: "rgba(0,255,65,0.1)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                flexShrink: 0,
              }}>
                #
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ color: "var(--green)", marginBottom: "2px", display: "flex", justifyContent: "space-between" }}>
                  <span>{group.name}</span>
                  {unread > 0 && (
                    <span style={{
                      background: "var(--green)",
                      color: "#000",
                      borderRadius: "10px",
                      fontSize: "10px",
                      padding: "1px 6px",
                      fontWeight: "bold",
                    }}>
                      {unread}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {lastMsg ? (() => {
                    const sender = state.contacts[lastMsg.fromAddress]?.nickname
                      ?? `${lastMsg.fromAddress.slice(0, 6)}…`;
                    const preview = lastMsg.fileRef?.mimeType.startsWith("audio/")
                      ? "🎤 Voice note"
                      : lastMsg.disappeared
                      ? "[ message disappeared ]"
                      : lastMsg.content.slice(0, 40);
                    return `${sender}: ${preview}`;
                  })() : `${group.memberAddresses.length} members`}
                </div>
              </div>
            </button>
          );
        })}

        {sorted.length === 0 && newContacts.length === 0 && pendingRequests.length === 0 && sortedGroups.length === 0 && (
          <div style={s.empty}>
            No contacts yet.
            <br />
            Click <strong>+ Add contact</strong> to get started.
          </div>
        )}
      </div>
    </div>
  );
}
