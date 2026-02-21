export type SignalingType =
  | "register"
  | "offer"
  | "answer"
  | "ice-candidate";

export interface SignalingMessage {
  type: SignalingType;
  from?: string;
  to?: string;
  payload: unknown;
}

const VALID_TYPES = new Set<string>(["register", "offer", "answer", "ice-candidate"]);
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Validate and parse a raw JSON string into a SignalingMessage.
 *
 * Returns null on any validation failure — the caller silently drops invalid messages.
 *
 * Validation:
 *   - type must be a known SignalingType
 *   - from/to fields, if present, must match Ethereum address format
 *
 * SECURITY: The server validates address format but does NOT verify that the
 * `from` field actually belongs to the sender (no signature check). A malicious
 * peer can forge the `from` address when relaying messages. The WebRTC ICE process
 * will fail if a MitM tries to intercept the data channel, but the displayed
 * sender address could be spoofed. Post-MVP: require SDP payload signatures.
 */
export function parseMessage(raw: string): SignalingMessage | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof obj["type"] !== "string" || !VALID_TYPES.has(obj["type"])) {
    return null;
  }

  if (obj["from"] !== undefined) {
    if (typeof obj["from"] !== "string" || !ETH_ADDRESS_RE.test(obj["from"])) {
      return null;
    }
  }

  if (obj["to"] !== undefined) {
    if (typeof obj["to"] !== "string" || !ETH_ADDRESS_RE.test(obj["to"])) {
      return null;
    }
  }

  return obj as unknown as SignalingMessage;
}
