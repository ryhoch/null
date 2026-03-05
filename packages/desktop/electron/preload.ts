/**
 * Electron preload script.
 *
 * Runs with Node.js access but exposes only a minimal, typed API to the
 * renderer via contextBridge. The renderer (sandbox=true) cannot call
 * Node.js or Electron APIs directly — everything goes through nullBridge.
 *
 * SECURITY: Never expose ipcRenderer directly. Each method has a narrow,
 * specific purpose. The renderer cannot invoke arbitrary IPC channels.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nullBridge", {
  platform: process.platform,

  signalingUrl: process.env["SIGNALING_URL"] ?? "wss://null-signaling-production.up.railway.app",

  // ── Storage (all ops run in main process against LevelDB) ──────────────────

  storage: {
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke("null:storage:get", { key }),

    put: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke("null:storage:put", { key, value }),

    del: (key: string): Promise<void> =>
      ipcRenderer.invoke("null:storage:del", { key }),

    list: (
      prefix: string
    ): Promise<Array<{ key: string; value: string }>> =>
      ipcRenderer.invoke("null:storage:list", { prefix }),
  },

  // ── System utilities ────────────────────────────────────────────────────────

  system: {
    getDataPath: (): Promise<string> =>
      ipcRenderer.invoke("null:system:get-data-path"),

    openFileDialog: (
      filters: Array<{ name: string; extensions: string[] }>
    ): Promise<string | null> =>
      ipcRenderer.invoke("null:system:open-file-dialog", { filters }),

    readFileBytes: (path: string): Promise<Uint8Array> =>
      ipcRenderer
        .invoke("null:system:read-file-bytes", { path })
        .then((arr: number[]) => new Uint8Array(arr)),

    copyToClipboard: (text: string): Promise<void> =>
      ipcRenderer.invoke("null:system:copy-to-clipboard", { text }),

    saveFile: (fileName: string, bytes: number[]): Promise<string> =>
      ipcRenderer.invoke("null:system:save-file", { fileName, bytes }),
  },

  // ── Deep link protocol (null://) ────────────────────────────────────────────

  onProtocolLink: (callback: (url: string) => void): void => {
    ipcRenderer.on("null:protocol-link", (_event, url: string) =>
      callback(url)
    );
  },
});
