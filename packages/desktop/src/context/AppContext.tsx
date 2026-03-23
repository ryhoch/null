import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  appReducer,
  initialState,
  type AppState,
  type AppAction,
  type Contact,
  type Conversation,
  type GroupConversation,
  type LocalMessage,
} from "./reducer.js";
import type { Group } from "@null/core/messaging";
import type { KeyStore } from "@null/core/wallet";

// ── Context value shape ────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  /** Returns the unsealed private key, or null if wallet is locked */
  getPrivateKey: () => Uint8Array | null;
}

const AppContext = createContext<AppContextValue | null>(null);

// ── Startup: load contacts + conversation history from LevelDB ─────────────

async function loadData(
  walletAddress: string,
  dispatch: Dispatch<AppAction>
): Promise<void> {
  const bridge = window.nullBridge;

  // Contacts
  const contactRows = await bridge.storage.list("contact:");
  const contacts: Record<string, Contact> = {};
  for (const { value } of contactRows) {
    try {
      const c = JSON.parse(value) as Contact;
      contacts[c.address] = c;
    } catch {
      // skip malformed entries
    }
  }
  dispatch({ type: "LOAD_CONTACTS", contacts });

  // Conversation messages (sorted by key = sorted by timestamp)
  const msgRows = await bridge.storage.list("msg:");

  // File bytes keyed by "contactAddress:transferId"
  const fileRows = await bridge.storage.list("file:");
  const fileMap = new Map<string, string>();
  for (const { key, value } of fileRows) {
    // key format: "file:${contactAddress}:${transferId}"
    const withoutPrefix = key.slice("file:".length);
    fileMap.set(withoutPrefix, value);
  }

  const conversations: Record<string, Conversation> = {};
  for (const { value } of msgRows) {
    try {
      const m = JSON.parse(value) as LocalMessage;
      const peer =
        m.fromAddress === walletAddress ? m.toAddress : m.fromAddress;
      if (!conversations[peer]) {
        conversations[peer] = {
          contactAddress: peer,
          messages: [],
          lastActivity: 0,
        };
      }
      // Rehydrate file bytes from LevelDB
      if (m.fileRef) {
        const b64 = fileMap.get(`${peer}:${m.fileRef.transferId}`);
        if (b64) {
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          m.fileRef = { ...m.fileRef, bytes };
        }
      }
      conversations[peer]!.messages.push(m);
      conversations[peer]!.lastActivity = Math.max(
        conversations[peer]!.lastActivity,
        m.timestamp
      );
    } catch {
      // skip malformed entries
    }
  }
  dispatch({ type: "LOAD_CONVERSATIONS", conversations });

  // Groups
  const groupRows = await bridge.storage.list("group:");
  const groups: Record<string, Group> = {};
  for (const { value } of groupRows) {
    try {
      const g = JSON.parse(value) as Group;
      groups[g.id] = g;
    } catch {
      // skip malformed entries
    }
  }
  dispatch({ type: "LOAD_GROUPS", groups });

  // Group conversation messages
  const gmsgRows = await bridge.storage.list("gmsg:");
  const groupConversations: Record<string, GroupConversation> = {};
  for (const { value } of gmsgRows) {
    try {
      const m = JSON.parse(value) as LocalMessage;
      const gid = m.toAddress; // groupId stored as toAddress
      if (!groupConversations[gid]) {
        groupConversations[gid] = { groupId: gid, messages: [], lastActivity: 0 };
      }
      groupConversations[gid]!.messages.push(m);
      groupConversations[gid]!.lastActivity = Math.max(
        groupConversations[gid]!.lastActivity,
        m.timestamp
      );
    } catch {
      // skip malformed entries
    }
  }
  dispatch({ type: "LOAD_GROUP_CONVERSATIONS", groupConversations });

  // DM disappear timer settings
  const convMetaRows = await bridge.storage.list("conv-meta:");
  for (const { key, value } of convMetaRows) {
    const addr = key.slice("conv-meta:".length);
    try {
      const meta = JSON.parse(value) as { disappearAfterMs?: number };
      if (meta.disappearAfterMs !== undefined) {
        dispatch({ type: "SET_DISAPPEAR_TIMER", contactAddress: addr, disappearAfterMs: meta.disappearAfterMs });
      }
    } catch { /* skip */ }
  }

  // Group disappear timer settings
  const groupMetaRows = await bridge.storage.list("group-meta:");
  for (const { key, value } of groupMetaRows) {
    const groupId = key.slice("group-meta:".length);
    try {
      const meta = JSON.parse(value) as { disappearAfterMs?: number };
      if (meta.disappearAfterMs !== undefined) {
        dispatch({ type: "SET_GROUP_DISAPPEAR_TIMER", groupId, disappearAfterMs: meta.disappearAfterMs });
      }
    } catch { /* skip */ }
  }
}

// ── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, baseDispatch] = useReducer(appReducer, initialState);

  /**
   * SECURITY: private key lives here — NOT in React state.
   * React state is observable by DevTools; useRef values are not.
   */
  const privateKeyRef = useRef<Uint8Array | null>(null);

  /**
   * Wrapped dispatch intercepts UNLOCK_WALLET to capture the private key in
   * the ref, then forwards a sanitised action (privateKey zeroed) to the reducer.
   */
  const dispatch: Dispatch<AppAction> = (action) => {
    if (action.type === "UNLOCK_WALLET") {
      privateKeyRef.current = action.privateKey;
      // Pass a copy with zeroed private key so the real bytes never enter state
      baseDispatch({ ...action, privateKey: new Uint8Array(0) });
    } else {
      baseDispatch(action);
    }
  };

  // On mount: check for existing keystore and set initial screen
  useEffect(() => {
    void (async () => {
      try {
        const [ksRaw, pubkeyHex] = await Promise.all([
          window.nullBridge.storage.get("keystore"),
          window.nullBridge.storage.get("wallet:pubkey"),
        ]);

        if (ksRaw && pubkeyHex) {
          const keystore = JSON.parse(ksRaw) as KeyStore;
          dispatch({ type: "SET_KEYSTORE", keystore });
          dispatch({ type: "SET_SCREEN", screen: "unlock" });
        } else {
          dispatch({ type: "SET_SCREEN", screen: "onboarding" });
        }
      } catch {
        dispatch({ type: "SET_SCREEN", screen: "onboarding" });
      }
    })();
  }, []);

  // When wallet unlocks: load persisted data
  useEffect(() => {
    if (state.wallet) {
      void loadData(state.wallet.address, dispatch);
    }
  }, [state.wallet?.address]);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        getPrivateKey: () => privateKeyRef.current,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
