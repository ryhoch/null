import type { KeyStore } from "@null/core/wallet";
import type { Group } from "@null/core/messaging";

// ── Screen ─────────────────────────────────────────────────────────────────

export type AppScreen =
  | "loading"
  | "onboarding"
  | "unlock"
  | "home"
  | "conversation"
  | "group-conversation"
  | "add-contact"
  | "create-group";

// ── Domain types ───────────────────────────────────────────────────────────

export interface FileRef {
  transferId: string;
  fileName: string;
  mimeType: string;
  totalSize: number;
  totalChunks?: number;
  receivedChunks?: number;
  bytes?: Uint8Array;
  savedPath?: string;
  /** Voice notes: duration in ms */
  voiceDuration?: number;
  /** Voice notes: amplitude waveform [0..1], 40-80 samples */
  waveform?: number[];
}

export interface LocalMessage {
  id: string;
  fromAddress: string;
  toAddress: string;       // contact address or groupId
  content: string;
  timestamp: number;
  status: "pending" | "delivered" | "failed";
  fileRef?: FileRef;
  /** Unix ms — message is auto-deleted after this time */
  expiresAt?: number;
  /** Payment message */
  payment?: PaymentRef;
  /** True after the message has disappeared (tombstone) */
  disappeared?: boolean;
}

export interface PaymentRef {
  txHash: string;
  amount: string;   // human-readable e.g. "0.01"
  token: string;    // e.g. "ETH", "USDC", "DEMOS"
  decimals: number;
  fromAddress: string;
  toAddress: string;
  chainId: number;
}

export interface Contact {
  address: string;
  pubkeyHex: string;
  nickname?: string;
}

export interface Conversation {
  contactAddress: string;
  messages: LocalMessage[];
  lastActivity: number;
  /** If set, messages auto-delete after this many ms */
  disappearAfterMs?: number;
}

export interface GroupConversation {
  groupId: string;
  messages: LocalMessage[];
  lastActivity: number;
  disappearAfterMs?: number;
}

export interface ActiveWallet {
  address: string;
  pubkeyHex: string;
}

export interface PendingContactRequest {
  address: string;
  pubkeyHex: string;
  receivedAt: number;
}

export type CallState =
  | { status: "idle" }
  | { status: "outgoing"; peerAddress: string; video: boolean; startedAt: number }
  | { status: "incoming"; peerAddress: string; video: boolean; callId: string }
  | { status: "active"; peerAddress: string; video: boolean; startedAt: number; muted: boolean; cameraOff: boolean };

// ── State ──────────────────────────────────────────────────────────────────

export interface AppState {
  screen: AppScreen;
  keystore: KeyStore | null;
  wallet: ActiveWallet | null;
  contacts: Record<string, Contact>;
  conversations: Record<string, Conversation>;
  groups: Record<string, Group>;
  groupConversations: Record<string, GroupConversation>;
  currentContactAddress: string | null;
  currentGroupId: string | null;
  peerStatuses: Record<string, "connecting" | "connected" | "disconnected">;
  unreadCounts: Record<string, number>;          // keyed by contact address or group id
  pendingContactRequests: Record<string, PendingContactRequest>;
  call: CallState;
}

export const initialState: AppState = {
  screen: "loading",
  keystore: null,
  wallet: null,
  contacts: {},
  conversations: {},
  groups: {},
  groupConversations: {},
  currentContactAddress: null,
  currentGroupId: null,
  peerStatuses: {},
  unreadCounts: {},
  pendingContactRequests: {},
  call: { status: "idle" },
};

// ── Actions ────────────────────────────────────────────────────────────────

export type AppAction =
  | { type: "SET_SCREEN"; screen: AppScreen }
  | { type: "SET_KEYSTORE"; keystore: KeyStore }
  | { type: "UNLOCK_WALLET"; wallet: ActiveWallet; privateKey: Uint8Array }
  | { type: "ADD_CONTACT"; contact: Contact }
  | { type: "OPEN_CONVERSATION"; contactAddress: string }
  | { type: "RECEIVE_MESSAGE"; contactAddress: string; message: LocalMessage }
  | { type: "SEND_MESSAGE"; contactAddress: string; message: LocalMessage }
  | { type: "UPDATE_MESSAGE_STATUS"; contactAddress: string; messageId: string; status: "delivered" | "failed" }
  | { type: "SET_PEER_STATUS"; address: string; status: "connecting" | "connected" | "disconnected" }
  | { type: "LOAD_CONTACTS"; contacts: Record<string, Contact> }
  | { type: "LOAD_CONVERSATIONS"; conversations: Record<string, Conversation> }
  | { type: "ADD_PENDING_REQUEST"; address: string; pubkeyHex: string }
  | { type: "DISMISS_PENDING_REQUEST"; address: string }
  | { type: "RENAME_CONTACT"; address: string; nickname: string }
  | { type: "REMOVE_CONTACT"; address: string }
  | { type: "DELETE_CONVERSATION"; address: string }
  | { type: "CLEAR_CONVERSATION"; address: string }
  | { type: "UPDATE_FILE_REF"; contactAddress: string; messageId: string; fileRef: Partial<FileRef> }
  | { type: "SET_DISAPPEAR_TIMER"; contactAddress: string; disappearAfterMs: number | undefined }
  | { type: "EXPIRE_MESSAGES"; contactAddress: string }
  // Groups
  | { type: "ADD_GROUP"; group: Group }
  | { type: "LOAD_GROUPS"; groups: Record<string, Group> }
  | { type: "OPEN_GROUP"; groupId: string }
  | { type: "RECEIVE_GROUP_MESSAGE"; groupId: string; message: LocalMessage }
  | { type: "SEND_GROUP_MESSAGE"; groupId: string; message: LocalMessage }
  | { type: "UPDATE_GROUP_MESSAGE_STATUS"; groupId: string; messageId: string; status: "delivered" | "failed" }
  | { type: "UPDATE_GROUP_FILE_REF"; groupId: string; messageId: string; fileRef: Partial<FileRef> }
  | { type: "REMOVE_GROUP"; groupId: string }
  | { type: "UPDATE_GROUP_MEMBERS"; groupId: string; memberAddresses: string[] }
  | { type: "SET_GROUP_DISAPPEAR_TIMER"; groupId: string; disappearAfterMs: number | undefined }
  | { type: "EXPIRE_GROUP_MESSAGES"; groupId: string }
  | { type: "LOAD_GROUP_CONVERSATIONS"; groupConversations: Record<string, GroupConversation> }
  // Calls
  | { type: "SET_CALL"; call: CallState };

// ── Reducer ────────────────────────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SCREEN":
      return { ...state, screen: action.screen };

    case "SET_KEYSTORE":
      return { ...state, keystore: action.keystore };

    case "UNLOCK_WALLET":
      return { ...state, wallet: action.wallet, screen: "home" };

    case "ADD_CONTACT":
      return {
        ...state,
        contacts: { ...state.contacts, [action.contact.address]: action.contact },
      };

    case "OPEN_CONVERSATION": {
      const existing = state.conversations[action.contactAddress];
      return {
        ...state,
        currentContactAddress: action.contactAddress,
        currentGroupId: null,
        screen: "conversation",
        unreadCounts: { ...state.unreadCounts, [action.contactAddress]: 0 },
        conversations: existing
          ? state.conversations
          : {
              ...state.conversations,
              [action.contactAddress]: {
                contactAddress: action.contactAddress,
                messages: [],
                lastActivity: Date.now(),
              },
            },
      };
    }

    case "SEND_MESSAGE": {
      const existing = state.conversations[action.contactAddress];
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.contactAddress]: {
            contactAddress: action.contactAddress,
            messages: [...(existing?.messages ?? []), action.message],
            lastActivity: action.message.timestamp,
            ...(existing?.disappearAfterMs !== undefined ? { disappearAfterMs: existing.disappearAfterMs } : {}),
          },
        },
      };
    }

    case "RECEIVE_MESSAGE": {
      const existing = state.conversations[action.contactAddress];
      const dm = existing?.disappearAfterMs;
      // Timer starts on delivery (receipt = delivery for receiver)
      const msg = dm !== undefined && !action.message.expiresAt
        ? { ...action.message, expiresAt: Date.now() + dm }
        : action.message;
      const isCurrentConv =
        state.screen === "conversation" &&
        state.currentContactAddress === action.contactAddress;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.contactAddress]: {
            contactAddress: action.contactAddress,
            messages: [...(existing?.messages ?? []), msg],
            lastActivity: msg.timestamp,
            ...(existing?.disappearAfterMs !== undefined ? { disappearAfterMs: existing.disappearAfterMs } : {}),
          },
        },
        unreadCounts: isCurrentConv
          ? state.unreadCounts
          : { ...state.unreadCounts, [action.contactAddress]: (state.unreadCounts[action.contactAddress] ?? 0) + 1 },
      };
    }

    case "UPDATE_MESSAGE_STATUS": {
      const conv = state.conversations[action.contactAddress];
      if (!conv) return state;
      const dm = conv.disappearAfterMs;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.contactAddress]: {
            ...conv,
            messages: conv.messages.map((m) => {
              if (m.id !== action.messageId) return m;
              // Timer starts on delivery for outgoing messages
              if (action.status === "delivered" && dm !== undefined && !m.expiresAt) {
                return { ...m, status: action.status, expiresAt: Date.now() + dm };
              }
              return { ...m, status: action.status };
            }),
          },
        },
      };
    }

    case "SET_PEER_STATUS":
      return { ...state, peerStatuses: { ...state.peerStatuses, [action.address]: action.status } };

    case "LOAD_CONTACTS":
      return { ...state, contacts: action.contacts };

    case "LOAD_CONVERSATIONS":
      return { ...state, conversations: action.conversations };

    case "ADD_PENDING_REQUEST": {
      if (state.contacts[action.address]) return state;
      if (state.pendingContactRequests[action.address]) return state;
      return {
        ...state,
        pendingContactRequests: {
          ...state.pendingContactRequests,
          [action.address]: { address: action.address, pubkeyHex: action.pubkeyHex, receivedAt: Date.now() },
        },
      };
    }

    case "DISMISS_PENDING_REQUEST": {
      const next = { ...state.pendingContactRequests };
      delete next[action.address];
      return { ...state, pendingContactRequests: next };
    }

    case "RENAME_CONTACT": {
      const existing = state.contacts[action.address];
      if (!existing) return state;
      return {
        ...state,
        contacts: {
          ...state.contacts,
          [action.address]: action.nickname
            ? { ...existing, nickname: action.nickname }
            : { address: existing.address, pubkeyHex: existing.pubkeyHex },
        },
      };
    }

    case "REMOVE_CONTACT": {
      const next = { ...state.contacts };
      delete next[action.address];
      return { ...state, contacts: next };
    }

    case "DELETE_CONVERSATION": {
      const nextConvs = { ...state.conversations };
      delete nextConvs[action.address];
      const nextUnread = { ...state.unreadCounts };
      delete nextUnread[action.address];
      return {
        ...state,
        conversations: nextConvs,
        unreadCounts: nextUnread,
        currentContactAddress: state.currentContactAddress === action.address ? null : state.currentContactAddress,
        screen: state.currentContactAddress === action.address ? "home" : state.screen,
      };
    }

    case "CLEAR_CONVERSATION": {
      const conv = state.conversations[action.address];
      if (!conv) return state;
      return {
        ...state,
        conversations: { ...state.conversations, [action.address]: { ...conv, messages: [], lastActivity: 0 } },
        unreadCounts: { ...state.unreadCounts, [action.address]: 0 },
      };
    }

    case "UPDATE_FILE_REF": {
      const conv = state.conversations[action.contactAddress];
      if (!conv) return state;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.contactAddress]: {
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === action.messageId
                ? { ...m, fileRef: m.fileRef ? { ...m.fileRef, ...action.fileRef } : (action.fileRef as FileRef) }
                : m
            ),
          },
        },
      };
    }

    case "SET_DISAPPEAR_TIMER": {
      const conv = state.conversations[action.contactAddress];
      const base: Conversation = conv ?? { contactAddress: action.contactAddress, messages: [], lastActivity: 0 };
      const { disappearAfterMs: _dms, ...rest } = base;
      const updated: Conversation = action.disappearAfterMs !== undefined
        ? { ...rest, disappearAfterMs: action.disappearAfterMs }
        : rest;
      return {
        ...state,
        conversations: { ...state.conversations, [action.contactAddress]: updated },
      };
    }

    case "EXPIRE_MESSAGES": {
      const conv = state.conversations[action.contactAddress];
      if (!conv) return state;
      const now = Date.now();
      let changed = false;
      const messages = conv.messages.map((m): LocalMessage => {
        if (!m.expiresAt || m.expiresAt > now || m.disappeared) return m;
        changed = true;
        return {
          id: m.id, fromAddress: m.fromAddress, toAddress: m.toAddress,
          content: "", timestamp: m.timestamp, status: m.status,
          disappeared: true, expiresAt: m.expiresAt,
          ...(m.payment !== undefined ? { payment: m.payment } : {}),
        };
      });
      if (!changed) return state;
      return {
        ...state,
        conversations: { ...state.conversations, [action.contactAddress]: { ...conv, messages } },
      };
    }

    // ── Groups ──────────────────────────────────────────────────────────────

    case "ADD_GROUP":
      return { ...state, groups: { ...state.groups, [action.group.id]: action.group } };

    case "LOAD_GROUPS":
      return { ...state, groups: action.groups };

    case "OPEN_GROUP": {
      const existing = state.groupConversations[action.groupId];
      return {
        ...state,
        currentGroupId: action.groupId,
        currentContactAddress: null,
        screen: "group-conversation",
        unreadCounts: { ...state.unreadCounts, [action.groupId]: 0 },
        groupConversations: existing
          ? state.groupConversations
          : {
              ...state.groupConversations,
              [action.groupId]: { groupId: action.groupId, messages: [], lastActivity: Date.now() },
            },
      };
    }

    case "SEND_GROUP_MESSAGE": {
      const existing = state.groupConversations[action.groupId];
      return {
        ...state,
        groupConversations: {
          ...state.groupConversations,
          [action.groupId]: {
            groupId: action.groupId,
            messages: [...(existing?.messages ?? []), action.message],
            lastActivity: action.message.timestamp,
            ...(existing?.disappearAfterMs !== undefined ? { disappearAfterMs: existing.disappearAfterMs } : {}),
          },
        },
      };
    }

    case "RECEIVE_GROUP_MESSAGE": {
      const existing = state.groupConversations[action.groupId];
      const dm = existing?.disappearAfterMs;
      const msg = dm !== undefined && !action.message.expiresAt
        ? { ...action.message, expiresAt: Date.now() + dm }
        : action.message;
      const isActive = state.screen === "group-conversation" && state.currentGroupId === action.groupId;
      return {
        ...state,
        groupConversations: {
          ...state.groupConversations,
          [action.groupId]: {
            groupId: action.groupId,
            messages: [...(existing?.messages ?? []), msg],
            lastActivity: msg.timestamp,
            ...(existing?.disappearAfterMs !== undefined ? { disappearAfterMs: existing.disappearAfterMs } : {}),
          },
        },
        unreadCounts: isActive
          ? state.unreadCounts
          : { ...state.unreadCounts, [action.groupId]: (state.unreadCounts[action.groupId] ?? 0) + 1 },
      };
    }

    case "UPDATE_GROUP_MESSAGE_STATUS": {
      const conv = state.groupConversations[action.groupId];
      if (!conv) return state;
      const dm = conv.disappearAfterMs;
      return {
        ...state,
        groupConversations: {
          ...state.groupConversations,
          [action.groupId]: {
            ...conv,
            messages: conv.messages.map((m) => {
              if (m.id !== action.messageId) return m;
              if (action.status === "delivered" && dm !== undefined && !m.expiresAt) {
                return { ...m, status: action.status, expiresAt: Date.now() + dm };
              }
              return { ...m, status: action.status };
            }),
          },
        },
      };
    }

    case "UPDATE_GROUP_FILE_REF": {
      const conv = state.groupConversations[action.groupId];
      if (!conv) return state;
      return {
        ...state,
        groupConversations: {
          ...state.groupConversations,
          [action.groupId]: {
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === action.messageId
                ? { ...m, fileRef: m.fileRef ? { ...m.fileRef, ...action.fileRef } : (action.fileRef as FileRef) }
                : m
            ),
          },
        },
      };
    }

    case "REMOVE_GROUP": {
      const nextGroups = { ...state.groups };
      delete nextGroups[action.groupId];
      const nextGCs = { ...state.groupConversations };
      delete nextGCs[action.groupId];
      const nextUnread = { ...state.unreadCounts };
      delete nextUnread[action.groupId];
      return {
        ...state,
        groups: nextGroups,
        groupConversations: nextGCs,
        unreadCounts: nextUnread,
        currentGroupId: state.currentGroupId === action.groupId ? null : state.currentGroupId,
        screen: state.currentGroupId === action.groupId ? "home" : state.screen,
      };
    }

    case "UPDATE_GROUP_MEMBERS": {
      const group = state.groups[action.groupId];
      if (!group) return state;
      return {
        ...state,
        groups: { ...state.groups, [action.groupId]: { ...group, memberAddresses: action.memberAddresses } },
      };
    }

    case "SET_GROUP_DISAPPEAR_TIMER": {
      const gc = state.groupConversations[action.groupId];
      const base: GroupConversation = gc ?? { groupId: action.groupId, messages: [], lastActivity: 0 };
      const { disappearAfterMs: _dms, ...rest } = base;
      const updated: GroupConversation = action.disappearAfterMs !== undefined
        ? { ...rest, disappearAfterMs: action.disappearAfterMs }
        : rest;
      return {
        ...state,
        groupConversations: { ...state.groupConversations, [action.groupId]: updated },
      };
    }

    case "EXPIRE_GROUP_MESSAGES": {
      const gc = state.groupConversations[action.groupId];
      if (!gc) return state;
      const now = Date.now();
      let changed = false;
      const messages = gc.messages.map((m): LocalMessage => {
        if (!m.expiresAt || m.expiresAt > now || m.disappeared) return m;
        changed = true;
        return {
          id: m.id, fromAddress: m.fromAddress, toAddress: m.toAddress,
          content: "", timestamp: m.timestamp, status: m.status,
          disappeared: true, expiresAt: m.expiresAt,
          ...(m.payment !== undefined ? { payment: m.payment } : {}),
        };
      });
      if (!changed) return state;
      return {
        ...state,
        groupConversations: { ...state.groupConversations, [action.groupId]: { ...gc, messages } },
      };
    }

    case "LOAD_GROUP_CONVERSATIONS":
      return { ...state, groupConversations: action.groupConversations };

    // ── Calls ───────────────────────────────────────────────────────────────

    case "SET_CALL":
      return { ...state, call: action.call };

    default:
      return state;
  }
}
