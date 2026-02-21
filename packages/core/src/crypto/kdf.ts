import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";

/**
 * PBKDF2 iteration count.
 *
 * SECURITY: 600,000 iterations follows OWASP 2023 minimum for PBKDF2-SHA256.
 * At this count, key derivation takes ~0.9s on modern desktop hardware and
 * ~2-4s on mid-range mobile. This is intentionally slow for brute-force
 * resistance.
 *
 * PERFORMANCE WARNING: This function is synchronous and will block the JS
 * thread. On mobile, call it off the main thread or use
 * InteractionManager.runAfterInteractions() before invoking.
 *
 * Post-MVP: migrate to Argon2id for memory-hard key derivation.
 */
const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 32; // 256-bit salt
const KEY_LENGTH = 32;  // 256-bit output key

/**
 * Generate a cryptographically random 32-byte salt.
 * A fresh salt must be generated for each new keystore — never reuse salts.
 */
export function generateSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Derive a 32-byte AES key from a user passcode + salt via PBKDF2-SHA256.
 *
 * Uses @noble/hashes synchronous PBKDF2 rather than Web Crypto's PBKDF2
 * because:
 *   1. React Native's expo-crypto does not expose SubtleCrypto.deriveBits
 *      consistently across all platforms/versions.
 *   2. @noble/hashes is a pure-JS, audited implementation that works
 *      identically in Node, browser, and React Native.
 *
 * SECURITY: The wrong passcode produces a wrong derived key. The AES-GCM
 * authentication tag will then fail on decryption, providing implicit
 * passcode verification without a timing-attackable comparison.
 */
export function derivePasscodeKey(
  passcode: string,
  salt: Uint8Array
): Uint8Array {
  const passBytes = new TextEncoder().encode(passcode);
  return pbkdf2(sha256, passBytes, salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  });
}

/** The iteration count used, exported so keystores can record it. */
export { PBKDF2_ITERATIONS };
