/**
 * Web bridge — implements window.nullBridge using browser APIs.
 *
 * Storage: IndexedDB key-value store (mirrors the Electron LevelDB API).
 * System:  Browser-native equivalents for clipboard, file download, etc.
 *
 * This lets the same React app code run unmodified in any modern browser.
 */

const DB_NAME = "null-db";
const STORE = "kv";
const DB_VERSION = 1;

// ── IndexedDB helpers ────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "k" });
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () =>
      resolve(req.result ? (req.result as { k: string; v: string }).v : null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ k: key, v: value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDel(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbList(
  prefix: string
): Promise<Array<{ key: string; value: string }>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = req.result as Array<{ k: string; v: string }>;
      resolve(
        all
          .filter((r) => r.k.startsWith(prefix))
          .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
          .map((r) => ({ key: r.k, value: r.v }))
      );
    };
    req.onerror = () => reject(req.error);
  });
}

// ── File picker helper ───────────────────────────────────────────────────────

function webOpenFileDialog(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      document.body.removeChild(input);
      resolve(file);
    };
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };
    input.click();
  });
}

// ── Bridge installation ──────────────────────────────────────────────────────

export function installWebBridge(): void {
  const SIGNALING_URL =
    typeof import.meta.env !== "undefined" && import.meta.env["VITE_SIGNALING_URL"]
      ? (import.meta.env["VITE_SIGNALING_URL"] as string)
      : "wss://null-signaling-production.up.railway.app";

  window.nullBridge = {
    platform: "web",
    signalingUrl: SIGNALING_URL,

    storage: {
      get: dbGet,
      put: dbPut,
      del: dbDel,
      list: dbList,
    },

    system: {
      async getDataPath() {
        return "";
      },

      async openFileDialog(_filters) {
        // Web: trigger a native file picker, return a fake path so callers
        // know a file was selected. The actual file bytes are read separately.
        // In practice, ConversationPage uses its own <input type="file"> ref
        // for file sending and doesn't call this — kept for API completeness.
        const file = await webOpenFileDialog();
        return file ? file.name : null;
      },

      async readFileBytes(_path) {
        // Not meaningful in a browser context — return empty.
        return new Uint8Array(0);
      },

      async copyToClipboard(text) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Fallback for older browsers
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
      },

      async saveFile(fileName, bytes) {
        const blob = new Blob([new Uint8Array(bytes)]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return fileName;
      },

    },

    onProtocolLink(_callback) {
      // Deep links are Electron-only — no-op in browser.
    },
  };
}
