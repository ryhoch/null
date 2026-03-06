import { useState, useRef, useEffect, type MutableRefObject } from "react";
import { useApp } from "../context/AppContext.js";
import { createGroup, encryptGroupKeyForMember } from "@null/core/messaging";
import { hexToBytes } from "@null/core/crypto";
import { PeerManager } from "@null/core/p2p";

interface GroupKeyEnvelope {
  type: "group-key";
  groupId: string;
  groupName: string;
  adminAddress: string;
  memberAddresses: string[];
  createdAt: number;
  encryptedKeyIv: string;
  encryptedKeyCiphertext: string;
}

const MAX_NAME_LENGTH = 64;

const s = {
  page: {
    padding: "32px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "28px",
    overflowY: "auto" as const,
    height: "100%",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  back: {
    background: "transparent",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: 0,
  },
  title: {
    fontSize: "16px",
    letterSpacing: "0.2em",
    color: "var(--green)",
    fontFamily: "var(--font)",
  },
  section: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  labelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: "11px",
    color: "var(--muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
    fontFamily: "var(--font)",
  },
  charCount: {
    fontSize: "11px",
    color: "var(--muted)",
    fontFamily: "var(--font)",
  },
  charCountWarn: {
    fontSize: "11px",
    color: "#ffaa00",
    fontFamily: "var(--font)",
  },
  input: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--green)",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: "10px 14px",
    width: "100%",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  inputFocused: {
    background: "transparent",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: "10px 14px",
    width: "100%",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  badge: {
    fontSize: "10px",
    color: "var(--green)",
    background: "rgba(0,255,65,0.12)",
    border: "1px solid rgba(0,255,65,0.3)",
    borderRadius: "2px",
    padding: "1px 7px",
    fontFamily: "var(--font)",
  },
  memberList: {
    border: "1px solid var(--border)",
    borderRadius: "2px",
    overflow: "hidden" as const,
  },
  memberRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
  },
  memberRowLast: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    cursor: "pointer",
  },
  memberRowDisabled: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    cursor: "default",
    background: "rgba(0,255,65,0.04)",
  },
  checkbox: {
    width: "14px",
    height: "14px",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "transparent",
  },
  checkboxChecked: {
    width: "14px",
    height: "14px",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "rgba(0,255,65,0.15)",
  },
  checkmark: {
    fontSize: "9px",
    color: "var(--green)",
    lineHeight: 1,
  },
  memberInfo: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
    flex: 1,
    minWidth: 0,
  },
  memberAddress: {
    fontSize: "12px",
    color: "var(--text)",
    fontFamily: "var(--font)",
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  memberNickname: {
    fontSize: "11px",
    color: "var(--muted)",
    fontFamily: "var(--font)",
  },
  adminTag: {
    fontSize: "10px",
    color: "var(--green)",
    fontFamily: "var(--font)",
    marginLeft: "auto",
    flexShrink: 0,
  },
  emptyContacts: {
    padding: "20px 14px",
    fontSize: "12px",
    color: "var(--muted)",
    fontFamily: "var(--font)",
    border: "1px solid var(--border)",
    borderRadius: "2px",
  },
  createBtn: {
    background: "rgba(0,255,65,0.08)",
    border: "1px solid var(--green)",
    borderRadius: "2px",
    color: "var(--green)",
    cursor: "pointer",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: "12px",
    width: "100%",
    letterSpacing: "0.1em",
  },
  createBtnDisabled: {
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--muted)",
    cursor: "not-allowed",
    fontSize: "13px",
    fontFamily: "var(--font)",
    padding: "12px",
    width: "100%",
    letterSpacing: "0.1em",
  },
  errorMsg: {
    fontSize: "12px",
    color: "#e05555",
    fontFamily: "var(--font)",
  },
  loadingMsg: {
    fontSize: "12px",
    color: "var(--muted)",
    fontFamily: "var(--font)",
  },
};

export function CreateGroupPage({ pmRef }: { pmRef: MutableRefObject<PeerManager | null> }) {
  const { state, dispatch, getPrivateKey } = useApp();

  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const wallet = state.wallet;
  const contacts = Object.values(state.contacts);
  const selectedCount = selected.size;
  const nearLimit = groupName.length >= MAX_NAME_LENGTH - 10;

  function toggleMember(address: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
    setError(null);
  }

  async function handleCreate() {
    const trimmedName = groupName.trim();

    if (!trimmedName) {
      setError("Group name is required.");
      inputRef.current?.focus();
      return;
    }

    if (selected.size === 0) {
      setError("Select at least one member to add to the group.");
      return;
    }

    if (!wallet) {
      setError("Wallet not available.");
      return;
    }

    const privKey = getPrivateKey();
    if (!privKey) {
      setError("Private key not available. Please unlock your wallet.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const memberAddresses = Array.from(selected);
      const group = await createGroup(trimmedName, wallet.address, memberAddresses);

      // Persist group to storage
      await window.nullBridge.storage.put("group:" + group.id, JSON.stringify(group));

      // Register group in app state
      dispatch({ type: "ADD_GROUP", group });

      // Distribute the group key to each selected member
      for (const memberAddress of memberAddresses) {
        const member = state.contacts[memberAddress];
        if (!member) continue;

        try {
          const encrypted = await encryptGroupKeyForMember(
            group.groupKeyHex,
            privKey,
            hexToBytes(member.pubkeyHex)
          );

          const envelope: GroupKeyEnvelope = {
            type: "group-key",
            groupId: group.id,
            groupName: group.name,
            adminAddress: wallet.address,
            memberAddresses: [wallet.address, ...memberAddresses],
            createdAt: group.createdAt,
            encryptedKeyIv: encrypted.encryptedKeyIv,
            encryptedKeyCiphertext: encrypted.encryptedKeyCiphertext,
          };

          pmRef.current?.sendTo(memberAddress, JSON.stringify(envelope));
        } catch (memberErr) {
          console.error(`Failed to send group key to ${memberAddress}:`, memberErr);
          // Non-fatal: continue with other members
        }
      }

      // Navigate to the new group
      dispatch({ type: "OPEN_GROUP", groupId: group.id });
    } catch (err) {
      console.error("Failed to create group:", err);
      setError(err instanceof Error ? err.message : "Failed to create group. Please try again.");
      setCreating(false);
    }
  }

  const canCreate = groupName.trim().length > 0 && selected.size > 0 && !creating;

  function truncateAddress(address: string): string {
    return address.slice(0, 8) + "…" + address.slice(-6);
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button
          style={s.back}
          onClick={() => dispatch({ type: "SET_SCREEN", screen: "home" })}
          disabled={creating}
        >
          ← back
        </button>
        <div style={s.title}>NEW GROUP</div>
      </div>

      {/* Group name input */}
      <div style={s.section}>
        <div style={s.labelRow}>
          <span style={s.label}>Group Name</span>
          <span style={nearLimit ? s.charCountWarn : s.charCount}>
            {groupName.length}/{MAX_NAME_LENGTH}
          </span>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={groupName}
          onChange={(e) => {
            setGroupName(e.target.value);
            setError(null);
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          placeholder="Enter group name…"
          maxLength={MAX_NAME_LENGTH}
          disabled={creating}
          style={inputFocused ? s.inputFocused : s.input}
        />
      </div>

      {/* Members section */}
      <div style={s.section}>
        <div style={s.labelRow}>
          <span style={s.label}>Add Members</span>
          {selectedCount > 0 && (
            <span style={s.badge}>{selectedCount} selected</span>
          )}
        </div>

        {/* Admin row — always shown, always checked */}
        {wallet && (
          <div style={s.memberList}>
            <div style={s.memberRowDisabled}>
              <div style={s.checkboxChecked}>
                <span style={s.checkmark}>✓</span>
              </div>
              <div style={s.memberInfo}>
                <span style={{ ...s.memberAddress, color: "var(--green)" }}>
                  {truncateAddress(wallet.address)}
                </span>
              </div>
              <span style={s.adminTag}>you · admin</span>
            </div>
          </div>
        )}

        {/* Contacts list */}
        {contacts.length === 0 ? (
          <div style={s.emptyContacts}>
            No contacts yet. Add contacts first.
          </div>
        ) : (
          <div style={s.memberList}>
            {contacts.map((contact, idx) => {
              const isLast = idx === contacts.length - 1;
              const isChecked = selected.has(contact.address);
              const rowStyle = isLast ? s.memberRowLast : s.memberRow;

              return (
                <div
                  key={contact.address}
                  style={rowStyle}
                  onClick={() => !creating && toggleMember(contact.address)}
                  role="checkbox"
                  aria-checked={isChecked}
                  tabIndex={creating ? -1 : 0}
                  onKeyDown={(e) => {
                    if ((e.key === " " || e.key === "Enter") && !creating) {
                      e.preventDefault();
                      toggleMember(contact.address);
                    }
                  }}
                >
                  <div style={isChecked ? s.checkboxChecked : s.checkbox}>
                    {isChecked && <span style={s.checkmark}>✓</span>}
                  </div>
                  <div style={s.memberInfo}>
                    <span style={s.memberAddress}>
                      {truncateAddress(contact.address)}
                    </span>
                    {contact.nickname && (
                      <span style={s.memberNickname}>{contact.nickname}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div style={s.errorMsg}>{error}</div>
      )}

      {/* Loading indicator */}
      {creating && (
        <div style={s.loadingMsg}>Creating group…</div>
      )}

      {/* Create button */}
      <button
        style={canCreate ? s.createBtn : s.createBtnDisabled}
        onClick={handleCreate}
        disabled={!canCreate}
      >
        CREATE GROUP →
      </button>
    </div>
  );
}
