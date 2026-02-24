import { app, BrowserWindow, ipcMain, dialog, clipboard } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { createDesktopStorage, type StorageAdapter } from "../src/storage/level-adapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let storage: StorageAdapter | null = null;
let mainWindow: BrowserWindow | null = null;

// ── Protocol registration (must happen before app is ready) ────────────────
// Register null:// as a custom deep-link protocol for this app.
// On macOS: open-url event fires with the URL.
// On Windows: the URL is passed as a command-line argument on second launch.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("null", process.execPath, [
      path.resolve(process.argv[1] ?? ""),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("null");
}

// Single-instance lock — on Windows, null:// links open a second instance.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ── Window creation ─────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
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

  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

// ── IPC: Storage handlers ────────────────────────────────────────────────────

function registerStorageHandlers(): void {
  ipcMain.handle(
    "null:storage:get",
    async (_e, { key }: { key: string }) => {
      if (!storage) return null;
      return (await storage.get(key)) ?? null;
    }
  );

  ipcMain.handle(
    "null:storage:put",
    async (_e, { key, value }: { key: string; value: string }) => {
      await storage?.put(key, value);
    }
  );

  ipcMain.handle(
    "null:storage:del",
    async (_e, { key }: { key: string }) => {
      await storage?.del(key);
    }
  );

  ipcMain.handle(
    "null:storage:list",
    async (_e, { prefix }: { prefix: string }) => {
      if (!storage) return [];
      return storage.list(prefix);
    }
  );
}

// ── IPC: System handlers ─────────────────────────────────────────────────────

function registerSystemHandlers(): void {
  ipcMain.handle("null:system:get-data-path", () => app.getPath("userData"));

  ipcMain.handle(
    "null:system:open-file-dialog",
    async (
      _e,
      { filters }: { filters: Array<{ name: string; extensions: string[] }> }
    ) => {
      const win = mainWindow ?? BrowserWindow.getFocusedWindow();
      const result = await dialog.showOpenDialog(win ?? new BrowserWindow(), {
        properties: ["openFile"],
        filters,
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    }
  );

  ipcMain.handle(
    "null:system:read-file-bytes",
    async (_e, { path: filePath }: { path: string }) => {
      const buf = await fs.readFile(filePath);
      return Array.from(buf); // JSON-serialisable; preload converts to Uint8Array
    }
  );

  ipcMain.handle(
    "null:system:copy-to-clipboard",
    (_e, { text }: { text: string }) => {
      clipboard.writeText(text);
    }
  );
}

// ── Deep link relay ──────────────────────────────────────────────────────────

function relayProtocolLink(url: string): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send("null:protocol-link", url);
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Initialise persistent LevelDB storage
  const dbPath = path.join(app.getPath("userData"), "null-db");
  storage = await createDesktopStorage(dbPath);

  registerStorageHandlers();
  registerSystemHandlers();

  createWindow();

  // Check for updates in production (silent check — notifies user when ready to install)
  if (process.env["NODE_ENV"] !== "development") {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows: null:// link triggers second-instance event
app.on("second-instance", (_event, commandLine) => {
  const url = commandLine.find((arg) => arg.startsWith("null://"));
  if (url) relayProtocolLink(url);

  // Bring the main window to the front
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// macOS: null:// link fires open-url while app is already running
app.on("open-url", (event, url) => {
  event.preventDefault();
  relayProtocolLink(url);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    void storage?.close().finally(() => app.quit());
  }
});
