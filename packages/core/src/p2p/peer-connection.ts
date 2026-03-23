import type { SignalingClient } from "./signaling-client.js";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Free public TURN relay — needed when both peers are behind symmetric NAT.
  // Replace with a self-hosted Coturn instance for production.
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

type MessageHandler = (data: string) => void;
type DisconnectedHandler = () => void;

/**
 * Manages a single WebRTC peer connection between this client and one remote peer.
 *
 * Lifecycle:
 *   - Initiator: createDataChannel → createOffer → send via signaling → ICE
 *   - Responder: receive offer → createAnswer → send via signaling → ICE
 *   - Both: add ICE candidates as they trickle in
 *
 * Uses dependency-injected RTCPeerConnection and RTCIceCandidate so that:
 *   - Browsers and React Native use globals registered by react-native-webrtc
 *   - Tests can inject mocks without network access
 *
 * DATA FRAMING NOTE: RTCDataChannel onmessage fires once per send() call, so
 * there is no fragmentation concern for individual messages. However, very large
 * messages (> ~64KB on some implementations) may be silently dropped. For
 * production, implement 4-byte length-prefix framing and chunking for large payloads.
 */
export class NullPeerConnection {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private messageHandlers: MessageHandler[] = [];
  private connectedHandlers: Array<() => void> = [];
  private disconnectedHandlers: DisconnectedHandler[] = [];
  private disconnectedFired = false;

  constructor(
    readonly remoteAddress: string,
    private readonly localAddress: string,
    private readonly signalingClient: SignalingClient,
    RTCPeerConnectionImpl: typeof RTCPeerConnection = globalThis.RTCPeerConnection
  ) {
    this.pc = new RTCPeerConnectionImpl({ iceServers: ICE_SERVERS });
    this.setupPeerConnectionHandlers();
  }

  /** Initiating side: create data channel, offer, and send via signaling. */
  async initiate(): Promise<void> {
    this.dataChannel = this.pc.createDataChannel("null-msg", { ordered: true });
    this.wireUpDataChannel(this.dataChannel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.signalingClient.send({
      type: "offer",
      from: this.localAddress,
      to: this.remoteAddress,
      payload: offer,
    });
  }

  /** Responding side: set the remote offer description and create an answer. */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.signalingClient.send({
      type: "answer",
      from: this.localAddress,
      to: this.remoteAddress,
      payload: answer,
    });
  }

  /** Set the remote answer on the initiating side. */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /** Add a trickle ICE candidate from the remote peer. */
  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** Send a string message to this peer. Returns false if the channel isn't open. */
  send(data: string): boolean {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(data);
      return true;
    }
    return false;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onConnected(handler: () => void): void {
    this.connectedHandlers.push(handler);
  }

  onDisconnected(handler: DisconnectedHandler): void {
    this.disconnectedHandlers.push(handler);
  }

  close(): void {
    this.dataChannel?.close();
    this.pc.close();
  }

  get state(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  getBufferedAmount(): number {
    return this.dataChannel?.bufferedAmount ?? 0;
  }

  private fireDisconnected(): void {
    if (this.disconnectedFired) return;
    this.disconnectedFired = true;
    for (const h of this.disconnectedHandlers) h();
  }

  private setupPeerConnectionHandlers(): void {
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === "disconnected" || s === "failed" || s === "closed") {
        this.fireDisconnected();
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingClient.send({
          type: "ice-candidate",
          from: this.localAddress,
          to: this.remoteAddress,
          payload: event.candidate.toJSON(),
        });
      }
    };

    // Responder receives the data channel created by the initiator
    this.pc.ondatachannel = (event) => {
      this.wireUpDataChannel(event.channel);
    };
  }

  private wireUpDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onopen = () => {
      for (const h of this.connectedHandlers) h();
    };

    channel.onmessage = (event: MessageEvent) => {
      for (const h of this.messageHandlers) h(event.data as string);
    };

    channel.onclose = () => {
      this.fireDisconnected();
    };
  }
}
