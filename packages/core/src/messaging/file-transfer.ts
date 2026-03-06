import { v4 as uuidv4 } from "uuid";
import { deriveSharedSecret } from "../crypto/ecdh.js";
import { importAesKey, encryptBytesAes, decryptBytesAes } from "../crypto/aes.js";

export const CHUNK_SIZE = 16384; // 16KB plaintext per chunk — keeps JSON-encoded chunks ≤22KB, safe for all TURN relays
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// ── Wire protocol types ───────────────────────────────────────────────────────

export interface FileMetaChunk {
  type: "file-meta";
  transferId: string;
  fileName: string;
  mimeType: string;
  totalChunks: number;
  totalSize: number;
  timestamp: number;
}

export interface FileDataChunk {
  type: "file-chunk";
  transferId: string;
  index: number; // 1-based
  data: string;  // base64 AES-GCM ciphertext
  iv: string;    // hex IV for this chunk
}

export interface FileCompleteChunk {
  type: "file-complete";
  transferId: string;
}

export type FileWireMessage = FileMetaChunk | FileDataChunk | FileCompleteChunk;

// ── Key derivation ────────────────────────────────────────────────────────────

export async function deriveFileKey(
  ourPrivKey: Uint8Array,
  theirPubKey: Uint8Array
): Promise<CryptoKey> {
  const sharedSecret = deriveSharedSecret(ourPrivKey, theirPubKey);
  return importAesKey(sharedSecret);
}

// ── Chunk helpers ─────────────────────────────────────────────────────────────

export async function encryptFileChunk(
  key: CryptoKey,
  plaintext: Uint8Array
): Promise<{ data: string; iv: string }> {
  const { iv, ciphertext } = await encryptBytesAes(key, plaintext);
  return { data: ciphertext, iv };
}

export async function decryptFileChunk(
  key: CryptoKey,
  data: string,
  iv: string
): Promise<Uint8Array> {
  return decryptBytesAes(key, iv, data);
}

// ── Transfer builder ──────────────────────────────────────────────────────────

export interface PreparedTransfer {
  transferId: string;
  meta: FileMetaChunk;
  totalChunks: number;
}

export function prepareTransfer(
  fileName: string,
  mimeType: string,
  totalSize: number
): PreparedTransfer {
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const transferId = uuidv4();
  return {
    transferId,
    totalChunks,
    meta: {
      type: "file-meta",
      transferId,
      fileName,
      mimeType,
      totalChunks,
      totalSize,
      timestamp: Date.now(),
    },
  };
}

// ── Parse helper ──────────────────────────────────────────────────────────────

export function parseFileWireMessage(raw: string): FileWireMessage | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const type = obj["type"];
    if (type === "file-meta" || type === "file-chunk" || type === "file-complete") {
      return obj as unknown as FileWireMessage;
    }
  } catch {
    // not JSON or not a file message
  }
  return null;
}
