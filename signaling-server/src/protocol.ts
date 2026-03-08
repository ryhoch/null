export type SignalingType =
  | "register"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "challenge";

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
 *   - type must be a known inbound SignalingType (challenge is server-outbound only)
 *   - from/to fields, if present, must match Ethereum address format
 *
 * Identity is verified via challenge-response in handlers.ts before registration.
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
