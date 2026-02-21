import type { StorageAdapter } from "../storage/types.js";
import type { EncryptedMessage } from "../crypto/types.js";
import type { QueueEntry } from "./types.js";
import {
  QUEUE_MAX_AGE_MS,
  QUEUE_MAX_ATTEMPTS,
  QUEUE_BASE_DELAY_MS,
  QUEUE_MAX_DELAY_MS,
} from "./types.js";

/**
 * Key prefix format: "queue:<recipientAddress>:<messageId>"
 *
 * SECURITY NOTE: The key structure exposes recipient addresses as plaintext
 * in the storage layer. An adversary with read access to the local storage
 * can learn who you are messaging, even if they cannot read message content.
 * Post-MVP: use opaque UUID keys with a separate encrypted address index.
 */
const QUEUE_PREFIX = "queue:";

export class OfflineQueue {
  constructor(private readonly storage: StorageAdapter) {}

  /**
   * Enqueue a message for a recipient that is currently offline.
   *
   * The payload stored is already encrypted — the queue never holds plaintext.
   * If a message with the same ID already exists (idempotent re-enqueue), it
   * is overwritten with reset attempt count.
   */
  async enqueue(message: EncryptedMessage): Promise<void> {
    const entry: QueueEntry = {
      id: message.id,
      encryptedPayload: JSON.stringify(message),
      recipientAddress: message.to,
      timestamp: Date.now(),
      attempts: 0,
      nextRetryAt: Date.now(),
    };
    await this.storage.put(this.key(message.to, message.id), JSON.stringify(entry));
  }

  /**
   * Retrieve all queued messages for a recipient that are due for retry.
   *
   * Side effects:
   *   - Deletes entries that are expired (> QUEUE_MAX_AGE_MS old)
   *   - Deletes entries that have exceeded QUEUE_MAX_ATTEMPTS
   *   - Returns only entries where nextRetryAt <= now
   *
   * Results are sorted by timestamp ascending (oldest first).
   */
  async drainForPeer(recipientAddress: string): Promise<QueueEntry[]> {
    const prefix = `${QUEUE_PREFIX}${recipientAddress}:`;
    const rows = await this.storage.list(prefix);
    const now = Date.now();
    const due: QueueEntry[] = [];

    for (const row of rows) {
      const entry: QueueEntry = JSON.parse(row.value) as QueueEntry;

      if (now - entry.timestamp > QUEUE_MAX_AGE_MS) {
        await this.storage.del(row.key);
        continue;
      }

      if (entry.attempts >= QUEUE_MAX_ATTEMPTS) {
        await this.storage.del(row.key);
        continue;
      }

      if (now >= entry.nextRetryAt) {
        due.push(entry);
      }
    }

    return due.sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Remove a successfully delivered message from the queue. */
  async markDelivered(recipientAddress: string, messageId: string): Promise<void> {
    await this.storage.del(this.key(recipientAddress, messageId));
  }

  /**
   * Increment attempt count and schedule next retry with exponential backoff.
   *
   * Backoff: min(BASE_DELAY * 2^attempts, MAX_DELAY)
   * e.g.  attempt 0 → 5s, 1 → 10s, 2 → 20s, ... capped at 1 hour
   */
  async markFailed(recipientAddress: string, messageId: string): Promise<void> {
    const k = this.key(recipientAddress, messageId);
    const raw = await this.storage.get(k);
    if (raw === undefined) return;

    const entry: QueueEntry = JSON.parse(raw) as QueueEntry;
    entry.attempts += 1;
    const backoff = Math.min(
      QUEUE_BASE_DELAY_MS * Math.pow(2, entry.attempts),
      QUEUE_MAX_DELAY_MS
    );
    entry.nextRetryAt = Date.now() + backoff;
    await this.storage.put(k, JSON.stringify(entry));
  }

  /** Return the total number of queued messages across all recipients. */
  async size(): Promise<number> {
    const rows = await this.storage.list(QUEUE_PREFIX);
    return rows.length;
  }

  private key(recipientAddress: string, messageId: string): string {
    return `${QUEUE_PREFIX}${recipientAddress}:${messageId}`;
  }
}
