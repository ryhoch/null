/**
 * Electron-specific LevelAdapter factory.
 *
 * Uses classic-level (LevelDB native bindings) for persistent storage
 * in the Electron main process or renderer (via ipc + main process proxy).
 *
 * In the renderer process (Electron): use browser-level (IndexedDB) instead,
 * since classic-level requires Node.js native bindings not available in sandbox.
 *
 * Usage (Electron main process):
 *   import { createDesktopStorage } from './storage/level-adapter';
 *   const storage = await createDesktopStorage('/path/to/app/data/null-db');
 */
import { ClassicLevel } from "classic-level";
import { LevelAdapter } from "@null/core/storage";

export async function createDesktopStorage(dbPath: string): Promise<LevelAdapter> {
  const db = new ClassicLevel<string, string>(dbPath, {
    keyEncoding: "utf8",
    valueEncoding: "utf8",
  });
  await db.open();
  return new LevelAdapter(db);
}
