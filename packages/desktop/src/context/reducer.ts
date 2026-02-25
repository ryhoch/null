import type { KeyStore } from "@null/core/wallet";

// ── Screen ─────────────────────────────────────────────────────────────────

export type AppScreen =
  | "loading"      // initial — checking storage for existing keystore
  | "onboarding"   // first launch — generate or import wallet
  | "unlock"       // keystore found, waiting for passcode
  | "home"         // wallet unlocked, conversation list
  | "conversation" // viewing a specific thread
  | "add-contact"; // add contact via QR or share link

// ── Domain types ───────────────────────────────────────────────────────────

export interface LocalMessage {
  id: string;
  fromAddress: string;
  toAddress: string;
  content: string; // plaintext — stored locally
  timestamp: number;
  status: "pending" | "delivered" | "failed";
}

export interface Contact {
  address: string;    // EIP-55 checksummed 0x address
  pubkeyHex: string;  // hex of 33-byte compressed secp256k1 public key
  nickname?: string;
}

export interface Conversation {
  contactAddress: string;
  messages: LocalMessage[];
  lastActivity: number;
}

export interface ActiveWallet {
  address: string;
  pubkeyHex: string;
  // NOTE: private key is NOT stored here — it lives in AppContext's privateKeyRef
}

export interface PendingContactRequest {
  address: string;
  pubkeyHex: string;
  receivedAt: number;
}

// ── State ──────────────────────────────────────────────────────────────────

export interface AppState {
  screen: AppScreen;
  keystore: KeyStore | null;
  wallet: ActiveWallet | null;
  contacts: Record<string, Contact>;
  conversations: Record<string, Conversation>;
  currentContactAddress: string | null;
  peerStatuses: Record<string, "connecting" | "connected" | "disconnected">;
  unreadCounts: Record<string, number>;
  pendingContactRequests: Record<string, PendingContactRequest>;
}

export const initialState: AppState = {
  screen: "loading",
  keystore: null,
  wallet: null,
  contacts: {},
  conversations: {},
  currentContactAddress: null,
  peerStatuses: {},
  unreadCounts: {},
  pendingContactRequests: {},
};

// ── Actions ────────────────────────────────────────────────────────────────

export type AppAction =
  | { type: "SET_SCREEN"; screen: AppScreen }
  | { type: "SET_KEYSTORE"; keystore: KeyStore }
  | {
      type: "UNLOCK_WALLET";
      wallet: ActiveWallet;
      // privateKey is captured by AppContext's ref — reducer receives it zeroed
      privateKey: Uint8Array;
    }
  | { type: "ADD_CONTACT"; contact: Contact }
  | { type: "OPEN_CONVERSATION"; contactAddress: string }
  | { type: "RECEIVE_MESSAGE"; contactAddress: string; message: LocalMessage }
  | { type: "SEND_MESSAGE"; contactAddress: string; message: LocalMessage }
  | {
      type: "UPDATE_MESSAGE_STATUS";
      contactAddress: string;
      messageId: string;
      status: "delivered" | "failed";
    }
  | {
      type: "SET_PEER_STATUS";
      address: string;
      status: "connecting" | "connected" | "disconnected";
    }
  | { type: "LOAD_CONTACTS"; contacts: Record<string, Contact> }
  | { type: "LOAD_CONVERSATIONS"; conversations: Record<string, Conversation> }
  | { type: "ADD_PENDING_REQUEST"; address: string; pubkeyHex: string }
  | { type: "DISMISS_PENDING_REQUEST"; address: string };

// ── Reducer ────────────────────────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SCREEN":
      return { ...state, screen: action.screen };

    case "SET_KEYSTORE":
      return { ...state, keystore: action.keystore };

    case "UNLOCK_WALLET":
      // privateKey is intentionally ignored here — AppContext's wrappedDispatch
      // captures it in a ref before calling this reducer.
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
      const updated: Conversation = {
        contactAddress: action.contactAddress,
        messages: [...(existing?.messages ?? []), action.message],
        lastActivity: action.message.timestamp,
      };
      return {
        ...state,
        conversations: { ...state.conversations, [action.contactAddress]: updated },
      };
    }

    case "RECEIVE_MESSAGE": {
      const existing = state.conversations[action.contactAddress];
      const updated: Conversation = {
        contactAddress: action.contactAddress,
        messages: [...(existing?.messages ?? []), action.message],
        lastActivity: action.message.timestamp,
      };
      const isCurrentConv =
        state.screen === "conversation" &&
        state.currentContactAddress === action.contactAddress;
      return {
        ...state,
        conversations: { ...state.conversations, [action.contactAddress]: updated },
        unreadCounts: isCurrentConv
          ? state.unreadCounts
          : {
              ...state.unreadCounts,
              [action.contactAddress]:
                (state.unreadCounts[action.contactAddress] ?? 0) + 1,
            },
      };
    }

    case "UPDATE_MESSAGE_STATUS": {
      const conv = state.conversations[action.contactAddress];
      if (!conv) return state;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.contactAddress]: {
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === action.messageId ? { ...m, status: action.status } : m
            ),
          },
        },
      };
    }

    case "SET_PEER_STATUS":
      return {
        ...state,
        peerStatuses: { ...state.peerStatuses, [action.address]: action.status },
      };

    case "LOAD_CONTACTS":
      return { ...state, contacts: action.contacts };

    case "LOAD_CONVERSATIONS":
      return { ...state, conversations: action.conversations };

    case "ADD_PENDING_REQUEST": {
      // Don't overwrite an existing contact or a request we already have
      if (state.contacts[action.address]) return state;
      if (state.pendingContactRequests[action.address]) return state;
      return {
        ...state,
        pendingContactRequests: {
          ...state.pendingContactRequests,
          [action.address]: {
            address: action.address,
            pubkeyHex: action.pubkeyHex,
            receivedAt: Date.now(),
          },
        },
      };
    }

    case "DISMISS_PENDING_REQUEST": {
      const next = { ...state.pendingContactRequests };
      delete next[action.address];
      return { ...state, pendingContactRequests: next };
    }

    default:
      return state;
  }
}
