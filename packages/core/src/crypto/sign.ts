import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";

/**
 * Sign a challenge nonce from the signaling server.
 *
 * The nonce is hashed with SHA-256 before signing so the private key never
 * operates on arbitrary-length input. The compact signature (64 bytes) plus
 * the recovery bit (0 or 1) allow the server to recover the public key and
 * derive the sender's Ethereum address for verification.
 */
export function signChallenge(
  nonce: string,
  privKey: Uint8Array
): { signature: string; recovery: 0 | 1 } {
  const hash = sha256(new TextEncoder().encode(nonce));
  const sig = secp256k1.sign(hash, privKey);
  return { signature: sig.toCompactHex(), recovery: sig.recovery as 0 | 1 };
}
