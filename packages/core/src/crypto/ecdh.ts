import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

const HKDF_INFO = new TextEncoder().encode("null-platform-v1");

/**
 * Derive a 32-byte shared secret via ECDH + HKDF-SHA256.
 *
 * The raw ECDH output (X coordinate of the shared EC point) is never used
 * directly as an encryption key. HKDF is applied on top to:
 *   1. Hash the full point to uniform key material
 *   2. Bind the key to the "null-platform-v1" context string, preventing
 *      cross-protocol key reuse attacks
 *
 * SECURITY NOTE: The shared secret is symmetric — deriveSharedSecret(alicePriv,
 * bobPub) === deriveSharedSecret(bobPriv, alicePub). This means A→B and B→A
 * messages share the same key. A leaked private key compromises both directions.
 * Post-MVP: add Signal Double Ratchet for per-message forward secrecy.
 */
export function deriveSharedSecret(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  // Returns 33-byte compressed point: 0x02|0x03 prefix + 32-byte X coordinate
  const sharedPoint = secp256k1.getSharedSecret(myPrivateKey, theirPublicKey);

  // Extract X coordinate only (skip the 1-byte prefix)
  const sharedX = sharedPoint.slice(1);

  // HKDF-SHA256: no salt (undefined), application info binds output to this protocol
  return hkdf(sha256, sharedX, undefined, HKDF_INFO, 32);
}

/**
 * Validate that a private key is a valid secp256k1 scalar in [1, n-1].
 */
export function isValidPrivateKey(privKey: Uint8Array): boolean {
  try {
    secp256k1.getPublicKey(privKey);
    return true;
  } catch {
    return false;
  }
}
