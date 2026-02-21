import { SignalingClient } from "./signaling-client.js";
import { NullPeerConnection } from "./peer-connection.js";
import type { SignalingMessage } from "./types.js";

type MessageCallback = (fromAddress: string, data: string) => void;
type PeerConnectedCallback = (address: string) => void;

/**
 * Manages all WebRTC peer connections for a local client.
 *
 * Responsibilities:
 *   - Connect to the signaling server and register the local address
 *   - Handle incoming offers from remote peers
 *   - Initiate connections to remote peers on demand
 *   - Route incoming data channel messages to registered callbacks
 *   - Emit "peer connected" events so the messaging layer can drain the offline queue
 */
export class PeerManager {
  private readonly signalingClient: SignalingClient;
  private readonly peers = new Map<string, NullPeerConnection>();
  private onMessageCallback: MessageCallback | null = null;
  private onPeerConnectedCallback: PeerConnectedCallback | null = null;

  constructor(
    signalingUrl: string,
    private readonly localAddress: string,
    WSImpl?: new (url: string) => WebSocket
  ) {
    this.signalingClient = new SignalingClient(
      signalingUrl,
      localAddress,
      WSImpl
    );
    this.setupSignalingHandlers();
  }

  /** Connect to the signaling server and register our address. */
  async connect(): Promise<void> {
    await this.signalingClient.connect();
  }

  /** Disconnect from the signaling server. Does not close existing P2P connections. */
  disconnect(): void {
    this.signalingClient.disconnect();
  }

  /** Register a callback for all incoming messages from any peer. */
  onMessage(callback: MessageCallback): void {
    this.onMessageCallback = callback;
  }

  /**
   * Register a callback fired when a WebRTC data channel opens to a peer.
   * Use this to drain the offline queue for that peer address.
   */
  onPeerConnected(callback: PeerConnectedCallback): void {
    this.onPeerConnectedCallback = callback;
  }

  /**
   * Initiate a WebRTC connection to a remote peer.
   * No-op if a connection to this address already exists.
   */
  async connectToPeer(remoteAddress: string): Promise<void> {
    if (this.peers.has(remoteAddress)) return;
    const conn = this.createConnection(remoteAddress);
    this.peers.set(remoteAddress, conn);
    await conn.initiate();
  }

  /**
   * Send data to a connected peer. Returns false if no open connection exists.
   */
  sendTo(remoteAddress: string, data: string): boolean {
    return this.peers.get(remoteAddress)?.send(data) ?? false;
  }

  /** Close and remove a specific peer connection. */
  closePeer(remoteAddress: string): void {
    this.peers.get(remoteAddress)?.close();
    this.peers.delete(remoteAddress);
  }

  /** Close all connections and the signaling client. */
  closeAll(): void {
    for (const [, conn] of this.peers) conn.close();
    this.peers.clear();
    this.signalingClient.disconnect();
  }

  private setupSignalingHandlers(): void {
    this.signalingClient.on("offer", async (msg: SignalingMessage) => {
      if (!msg.from) return;
      const conn = this.createConnection(msg.from);
      this.peers.set(msg.from, conn);
      await conn.handleOffer(msg.payload as RTCSessionDescriptionInit);
    });

    this.signalingClient.on("answer", async (msg: SignalingMessage) => {
      if (!msg.from) return;
      await this.peers.get(msg.from)?.handleAnswer(
        msg.payload as RTCSessionDescriptionInit
      );
    });

    this.signalingClient.on("ice-candidate", async (msg: SignalingMessage) => {
      if (!msg.from) return;
      await this.peers.get(msg.from)?.handleIceCandidate(
        msg.payload as RTCIceCandidateInit
      );
    });
  }

  private createConnection(remoteAddress: string): NullPeerConnection {
    const conn = new NullPeerConnection(
      remoteAddress,
      this.localAddress,
      this.signalingClient
    );

    conn.onMessage((data) => {
      this.onMessageCallback?.(remoteAddress, data);
    });

    conn.onConnected(() => {
      this.onPeerConnectedCallback?.(remoteAddress);
    });

    return conn;
  }
}
