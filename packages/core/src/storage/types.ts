/**
 * Platform-agnostic storage interface.
 *
 * Implementations:
 *   - MemoryAdapter     — in-memory, tests and development only
 *   - LevelAdapter      — abstract-level (IndexedDB in browser, LevelDB in Node/Electron)
 *   - SecureStoreAdapter — expo-secure-store, iOS Keychain / Android Keystore (mobile)
 *
 * All keys and values are strings. Callers are responsible for JSON serialization.
 * Callers are also responsible for encrypting sensitive values before storage.
 */
export interface StorageAdapter {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  /**
   * List all entries whose key starts with `prefix`, sorted by key ascending.
   * Used for scanning the offline message queue by recipient address prefix.
   */
  list(prefix: string): Promise<Array<{ key: string; value: string }>>;
  close(): Promise<void>;
}
