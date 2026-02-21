import type { AbstractLevel } from "abstract-level";
import type { StorageAdapter } from "./types.js";

type LevelDB = AbstractLevel<string, string, string>;

/**
 * StorageAdapter backed by abstract-level.
 *
 * Compatible with any abstract-level implementation:
 *   - memory-level    — in-memory (tests, Storybook)
 *   - browser-level   — IndexedDB (Electron renderer, PWA)
 *   - classic-level   — LevelDB native bindings (Electron main process)
 *
 * The db instance is injected, so the caller chooses the backend.
 */
export class LevelAdapter implements StorageAdapter {
  constructor(private readonly db: LevelDB) {}

  async get(key: string): Promise<string | undefined> {
    try {
      return await this.db.get(key);
    } catch (err: unknown) {
      if (isNotFoundError(err)) return undefined;
      throw err;
    }
  }

  async put(key: string, value: string): Promise<void> {
    await this.db.put(key, value);
  }

  async del(key: string): Promise<void> {
    try {
      await this.db.del(key);
    } catch (err: unknown) {
      if (isNotFoundError(err)) return; // deleting non-existent key is fine
      throw err;
    }
  }

  async list(prefix: string): Promise<Array<{ key: string; value: string }>> {
    const results: Array<{ key: string; value: string }> = [];
    // \xFF is the highest single-byte value — used as upper bound for prefix scan
    for await (const [key, value] of this.db.iterator({
      gte: prefix,
      lte: prefix + "\xFF",
    })) {
      results.push({ key, value });
    }
    return results;
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

function isNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as { code?: unknown }).code === "LEVEL_NOT_FOUND"
  );
}
