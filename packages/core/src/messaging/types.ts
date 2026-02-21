export type MessageStatus = "pending" | "delivered" | "failed";

export interface QueueEntry {
  /** Matches the EncryptedMessage.id for deduplication */
  id: string;
  /** JSON.stringify(EncryptedMessage) — ciphertext, never plaintext */
  encryptedPayload: string;
  recipientAddress: string;
  /** Unix ms timestamp of original enqueue */
  timestamp: number;
  attempts: number;
  /** Unix ms — do not retry before this time */
  nextRetryAt: number;
}

/** 7 days — messages older than this are discarded from the queue */
export const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** After this many attempts, a message is permanently dropped */
export const QUEUE_MAX_ATTEMPTS = 10;
/** Initial retry delay in ms. Doubles on each failure (exponential backoff). */
export const QUEUE_BASE_DELAY_MS = 5_000;
/** Maximum retry interval cap (1 hour) */
export const QUEUE_MAX_DELAY_MS = 60 * 60 * 1000;
