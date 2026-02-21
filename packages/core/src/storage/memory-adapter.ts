import type { StorageAdapter } from "./types.js";

/**
 * In-memory StorageAdapter for tests and development.
 *
 * SECURITY: This adapter stores data in plaintext in the JavaScript heap.
 * It must NEVER be used in production builds.
 *
 * In test environments, check NODE_ENV or pass a build flag to ensure
 * only MemoryAdapter is instantiated in test/dev contexts.
 */
export class MemoryAdapter implements StorageAdapter {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.store.get(key);
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix: string): Promise<Array<{ key: string; value: string }>> {
    const results: Array<{ key: string; value: string }> = [];
    for (const [key, value] of this.store) {
      if (key.startsWith(prefix)) {
        results.push({ key, value });
      }
    }
    return results.sort((a, b) => a.key.localeCompare(b.key));
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}
