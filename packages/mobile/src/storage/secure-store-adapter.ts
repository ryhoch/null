import * as SecureStore from "expo-secure-store";
import type { StorageAdapter } from "@null/core/storage";

/**
 * StorageAdapter backed by Expo SecureStore.
 *
 * On iOS: values stored in the Keychain (hardware-backed on devices with Secure Enclave).
 * On Android: values stored in EncryptedSharedPreferences (backed by Android Keystore).
 *
 * LIMITATIONS:
 *   - Maximum value size: ~2KB on iOS. Larger values (e.g., offline queue entries)
 *     must be stored in an encrypted file and keyed by a short ID in SecureStore.
 *   - SecureStore does not support key enumeration, so this adapter maintains
 *     a separate index per prefix to support the list() operation.
 *   - Keys must match /^[a-zA-Z0-9._-]+$/ and be ≤ 255 characters.
 *
 * For the offline message queue (potentially many entries), consider using a
 * encrypted LevelDB file stored in the app's document directory, with only
 * the encryption key stored in SecureStore.
 */
export class SecureStoreAdapter implements StorageAdapter {
  private readonly cache = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    const safe = sanitizeKey(key);
    if (this.cache.has(safe)) return this.cache.get(safe);
    const val = await SecureStore.getItemAsync(safe);
    if (val !== null) {
      this.cache.set(safe, val);
      return val;
    }
    return undefined;
  }

  async put(key: string, value: string): Promise<void> {
    const safe = sanitizeKey(key);
    await SecureStore.setItemAsync(safe, value);
    this.cache.set(safe, value);
    await this.addToIndex(key, safe);
  }

  async del(key: string): Promise<void> {
    const safe = sanitizeKey(key);
    await SecureStore.deleteItemAsync(safe);
    this.cache.delete(safe);
    await this.removeFromIndex(key, safe);
  }

  async list(prefix: string): Promise<Array<{ key: string; value: string }>> {
    const indexKey = sanitizeKey(`__index__${prefix}`);
    const indexRaw = await SecureStore.getItemAsync(indexKey);
    const keys: string[] = indexRaw !== null ? (JSON.parse(indexRaw) as string[]) : [];

    const results: Array<{ key: string; value: string }> = [];
    for (const k of keys) {
      const v = await this.get(k);
      if (v !== undefined) results.push({ key: k, value: v });
    }
    return results;
  }

  async close(): Promise<void> {
    this.cache.clear();
  }

  private async addToIndex(originalKey: string, _safeKey: string): Promise<void> {
    const prefix = getPrefix(originalKey);
    if (!prefix) return;
    const indexKey = sanitizeKey(`__index__${prefix}`);
    const existing = await SecureStore.getItemAsync(indexKey);
    const keys: string[] = existing !== null ? (JSON.parse(existing) as string[]) : [];
    if (!keys.includes(originalKey)) {
      keys.push(originalKey);
      await SecureStore.setItemAsync(indexKey, JSON.stringify(keys));
    }
  }

  private async removeFromIndex(originalKey: string, _safeKey: string): Promise<void> {
    const prefix = getPrefix(originalKey);
    if (!prefix) return;
    const indexKey = sanitizeKey(`__index__${prefix}`);
    const existing = await SecureStore.getItemAsync(indexKey);
    if (existing === null) return;
    const keys = (JSON.parse(existing) as string[]).filter((k) => k !== originalKey);
    await SecureStore.setItemAsync(indexKey, JSON.stringify(keys));
  }
}

/** Extract the prefix (everything up to and including the first ':') */
function getPrefix(key: string): string | null {
  const idx = key.indexOf(":");
  return idx >= 0 ? key.slice(0, idx + 1) : null;
}

/**
 * SecureStore key constraints: [a-zA-Z0-9._-], max 255 chars.
 * Replace invalid characters with underscores.
 */
function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}
