export type SignalingMessageType =
  | "register"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "peer-unavailable"
  | "challenge";

export interface SignalingMessage {
  type: SignalingMessageType;
  /** Sender's Ethereum wallet address */
  from?: string;
  /** Recipient's Ethereum wallet address */
  to?: string;
  /** SDP object, RTCIceCandidateInit, or null */
  payload: unknown;
}

export type PeerState = "connecting" | "connected" | "disconnected";

export interface PeerInfo {
  address: string;
  state: PeerState;
}
