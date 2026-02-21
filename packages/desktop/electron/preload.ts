/**
 * Electron preload script.
 *
 * Runs in the renderer context but has access to Node.js APIs.
 * Uses contextBridge to expose a safe, minimal API to the renderer.
 *
 * SECURITY: Only expose the minimum needed. Never expose ipcRenderer directly.
 * Each exposed function should have a narrow, specific purpose.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nullBridge", {
  /**
   * Get the platform string so the renderer can select the right storage adapter.
   * The renderer itself cannot call process.platform (sandbox mode).
   */
  platform: process.platform,

  /**
   * Get the app's user data path for LevelDB storage.
   * Renderer needs this to initialize the classic-level database.
   */
  getUserDataPath: (): Promise<string> =>
    ipcRenderer.invoke("get-user-data-path"),
});
