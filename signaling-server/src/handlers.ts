import type { WebSocket } from "ws";
import type { Registry } from "./registry.js";
import type { SignalingMessage } from "./protocol.js";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";

/**
 * Verify that a registration signature was produced by the private key
 * corresponding to the claimed Ethereum address.
 *
 * 1. Hash the nonce with SHA-256
 * 2. Recover the public key from the compact signature + recovery bit
 * 3. Derive Ethereum address: keccak256(uncompressed_pubkey[1:])[12:]
 * 4. Compare (case-insensitive) with the claimed `from` address
 */
function verifyRegistration(
  nonce: string,
  from: string,
  signature: string,
  recovery: 0 | 1
): boolean {
  try {
    const hash = sha256(new TextEncoder().encode(nonce));
    const sig = secp256k1.Signature.fromCompact(signature).addRecoveryBit(recovery);
    const pub = sig.recoverPublicKey(hash).toRawBytes(false); // 65 bytes uncompressed
    const addrBytes = keccak_256(pub.slice(1)).slice(12); // last 20 bytes
    const derivedAddr = "0x" + bytesToHex(addrBytes);
    return derivedAddr.toLowerCase() === from.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Route a validated SignalingMessage.
 *
 * For relay types (offer, answer, ice-candidate): forward verbatim to the
 * recipient's socket. The server never inspects the payload content.
 *
 * For "register": verify the challenge-response signature before mapping
 * the sender's address to their WebSocket. Unsigned or invalid registrations
 * are rejected and the connection is terminated.
 *
 * If the recipient is not connected, send a peer-unavailable notification back
 * to the sender so the client can queue the message for later delivery.
 */
export function handleMessage(
  msg: SignalingMessage,
  senderSocket: WebSocket,
  registry: Registry
): void {
  switch (msg.type) {
    case "register": {
      if (!msg.from) return;

      const nonce = registry.consumePending(senderSocket);
      if (!nonce) {
        senderSocket.send(JSON.stringify({ type: "error", payload: { message: "no challenge issued" } }));
        senderSocket.terminate();
        return;
      }

      const payload = msg.payload as Record<string, unknown> | null;
      const signature = typeof payload?.["signature"] === "string" ? payload["signature"] : null;
      const recovery =
        payload?.["recovery"] === 0 || payload?.["recovery"] === 1
          ? (payload["recovery"] as 0 | 1)
          : null;

      if (!signature || recovery === null || !verifyRegistration(nonce, msg.from, signature, recovery)) {
        senderSocket.send(JSON.stringify({ type: "error", payload: { message: "invalid signature" } }));
        senderSocket.terminate();
        return;
      }

      registry.register(msg.from, senderSocket);
      break;
    }

    case "offer":
    case "answer":
    case "ice-candidate": {
      if (!msg.to) return;
      const recipientSocket = registry.getSocket(msg.to);

      if (recipientSocket === undefined) {
        senderSocket.send(
          JSON.stringify({
            type: "peer-unavailable",
            payload: { address: msg.to },
          })
        );
        return;
      }

      // Forward the raw message — payload is never read by the server
      recipientSocket.send(JSON.stringify(msg));
      break;
    }
  }
}
