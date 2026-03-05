const ALGORITHM = "AES-GCM";
const KEY_LENGTH_BITS = 256;
const IV_LENGTH = 12; // 96-bit IV — recommended for AES-GCM

// ── Hex helpers ──────────────────────────────────────────────────────────────

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string: odd length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) throw new Error(`Invalid hex character at position ${i * 2}`);
    bytes[i] = byte;
  }
  return bytes;
}

// ── Key management ───────────────────────────────────────────────────────────

/**
 * Import 32 raw bytes as a non-extractable AES-256-GCM CryptoKey.
 *
 * SECURITY: `extractable: false` prevents JavaScript from ever reading the raw
 * key bytes back out of the CryptoKey object after import. The key material is
 * held in the Web Crypto implementation's secure memory.
 */
export async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== 32) {
    throw new Error(`AES-256 requires a 32-byte key, got ${rawKey.length}`);
  }
  // Slice to a plain ArrayBuffer — TS 5.7 requires ArrayBuffer, not ArrayBufferLike
  const keyBuffer = rawKey.buffer.slice(
    rawKey.byteOffset,
    rawKey.byteOffset + rawKey.byteLength
  ) as ArrayBuffer;
  return globalThis.crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: ALGORITHM, length: KEY_LENGTH_BITS },
    false, // non-extractable
    ["encrypt", "decrypt"]
  );
}

// ── Encrypt / Decrypt ────────────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 plaintext string with AES-256-GCM.
 *
 * A fresh cryptographically random 12-byte IV is generated for every call.
 * The GCM authentication tag (16 bytes) is appended to the ciphertext by
 * the Web Crypto API — callers do not need to handle it separately.
 *
 * SECURITY: Never pass an IV from an external source. The IV must always be
 * generated internally via getRandomValues. IV reuse with the same key under
 * AES-GCM is catastrophic — it allows an attacker to recover the keystream.
 *
 * Returns hex-encoded { iv, ciphertext } where ciphertext includes the GCM tag.
 */
export async function encryptAes(
  key: CryptoKey,
  plaintext: string
): Promise<{ iv: string; ciphertext: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  // Slice to plain ArrayBuffer — TS 5.7 requires ArrayBuffer, not ArrayBufferLike
  const ivBuffer = iv.buffer.slice(
    iv.byteOffset,
    iv.byteOffset + iv.byteLength
  ) as ArrayBuffer;
  const encodedBuffer = encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  ) as ArrayBuffer;

  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: ALGORITHM, iv: ivBuffer },
    key,
    encodedBuffer
  );

  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypt AES-256-GCM ciphertext.
 *
 * Throws a DOMException with name "OperationError" if the GCM authentication
 * tag is invalid — i.e., the ciphertext has been tampered with, the IV is
 * wrong, or the key is wrong. This provides authenticated decryption: callers
 * do not need a separate HMAC check.
 */
export async function decryptAes(
  key: CryptoKey,
  iv: string,
  ciphertext: string
): Promise<string> {
  const ivBytes = hexToBytes(iv);
  const ctBytes = hexToBytes(ciphertext);

  // Slice to plain ArrayBuffer — TS 5.7 requires ArrayBuffer, not ArrayBufferLike
  const ivBuffer = ivBytes.buffer.slice(
    ivBytes.byteOffset,
    ivBytes.byteOffset + ivBytes.byteLength
  ) as ArrayBuffer;
  const ctBuffer = ctBytes.buffer.slice(
    ctBytes.byteOffset,
    ctBytes.byteOffset + ctBytes.byteLength
  ) as ArrayBuffer;

  const plainBuffer = await globalThis.crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBuffer },
    key,
    ctBuffer
  );

  return new TextDecoder().decode(plainBuffer);
}

// ── Binary helpers ────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypt raw bytes with AES-256-GCM.
 * Returns hex-encoded iv and base64-encoded ciphertext (more compact than hex for binary data).
 */
export async function encryptBytesAes(
  key: CryptoKey,
  plaintext: Uint8Array
): Promise<{ iv: string; ciphertext: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ivBuffer = iv.buffer.slice(
    iv.byteOffset,
    iv.byteOffset + iv.byteLength
  ) as ArrayBuffer;
  const plainBuffer = plaintext.buffer.slice(
    plaintext.byteOffset,
    plaintext.byteOffset + plaintext.byteLength
  ) as ArrayBuffer;

  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: ALGORITHM, iv: ivBuffer },
    key,
    plainBuffer
  );

  return {
    iv: bytesToHex(iv),
    ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypt AES-256-GCM binary ciphertext.
 * iv is hex-encoded; ciphertext is base64-encoded.
 */
export async function decryptBytesAes(
  key: CryptoKey,
  iv: string,
  ciphertext: string
): Promise<Uint8Array> {
  const ivBytes = hexToBytes(iv);
  const ctBytes = base64ToUint8(ciphertext);

  const ivBuffer = ivBytes.buffer.slice(
    ivBytes.byteOffset,
    ivBytes.byteOffset + ivBytes.byteLength
  ) as ArrayBuffer;
  const ctBuffer = ctBytes.buffer.slice(
    ctBytes.byteOffset,
    ctBytes.byteOffset + ctBytes.byteLength
  ) as ArrayBuffer;

  const plainBuffer = await globalThis.crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBuffer },
    key,
    ctBuffer
  );

  return new Uint8Array(plainBuffer);
}
