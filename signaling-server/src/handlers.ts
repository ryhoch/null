import type { WebSocket } from "ws";
import type { Registry } from "./registry.js";
import type { SignalingMessage } from "./protocol.js";

/**
 * Route a validated SignalingMessage.
 *
 * For relay types (offer, answer, ice-candidate): forward verbatim to the
 * recipient's socket. The server never inspects the payload content.
 *
 * For "register": map the sender's address to their WebSocket.
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
