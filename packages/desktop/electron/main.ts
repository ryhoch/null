import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Electron main process entry point.
 *
 * SECURITY CONFIGURATION:
 *   - contextIsolation: true  — renderer cannot access Node.js APIs directly
 *   - nodeIntegration: false  — prevents XSS from escalating to full Node access
 *   - sandbox: true           — renderer runs in Chromium's process sandbox
 *
 * WebRTC is available natively in the Electron renderer (Chromium engine).
 * No react-native-webrtc shim is needed — RTCPeerConnection is a global.
 *
 * For production, add:
 *   - Content Security Policy headers via session.defaultSession.webRequest
 *   - app.commandLine.appendSwitch('enforce-webrtc-ip-permission-check')
 *     to prevent WebRTC IP leakage when users have not granted permission
 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env["NODE_ENV"] === "development") {
    void win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
