import { v4 as uuidv4 } from "uuid";
import { deriveSharedSecret } from "../crypto/ecdh.js";
import { importAesKey, encryptAes, decryptAes } from "../crypto/aes.js";
import type { EncryptedMessage } from "../crypto/types.js";

export interface EncryptMessageParams {
  content: string;
  fromAddress: string;
  toAddress: string;
  senderPrivKey: Uint8Array;
  recipientPubKey: Uint8Array;
}

export interface DecryptMessageParams {
  message: EncryptedMessage;
  recipientPrivKey: Uint8Array;
  senderPubKey: Uint8Array;
}

/**
 * Encrypt a plaintext message from sender to recipient.
 *
 * Key derivation: ECDH(senderPriv, recipientPub) → HKDF → AES-256-GCM key
 *
 * SECURITY: The ECDH shared secret is symmetric. senderPriv+recipientPub and
 * recipientPriv+senderPub produce the same key. Both conversation directions
 * share a key — see crypto/ecdh.ts for the forward-secrecy caveat.
 */
export async function encryptMessage(
  params: EncryptMessageParams
): Promise<EncryptedMessage> {
  const sharedSecret = deriveSharedSecret(
    params.senderPrivKey,
    params.recipientPubKey
  );
  const key = await importAesKey(sharedSecret);
  const { iv, ciphertext } = await encryptAes(key, params.content);

  return {
    id: uuidv4(),
    from: params.fromAddress,
    to: params.toAddress,
    iv,
    ciphertext,
    timestamp: Date.now(),
  };
}

/**
 * Decrypt a received EncryptedMessage.
 *
 * Throws if the message has been tampered with (GCM tag failure).
 */
export async function decryptMessage(
  params: DecryptMessageParams
): Promise<string> {
  const sharedSecret = deriveSharedSecret(
    params.recipientPrivKey,
    params.senderPubKey
  );
  const key = await importAesKey(sharedSecret);
  return decryptAes(key, params.message.iv, params.message.ciphertext);
}
