export interface EncryptedMessage {
  /** UUID v4 — unique message identifier */
  id: string;
  /** Sender's Ethereum address (0x...) */
  from: string;
  /** Recipient's Ethereum address (0x...) */
  to: string;
  /** Hex-encoded 12-byte random IV */
  iv: string;
  /** Hex-encoded AES-256-GCM ciphertext (includes 16-byte auth tag) */
  ciphertext: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

export interface RawMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
}
