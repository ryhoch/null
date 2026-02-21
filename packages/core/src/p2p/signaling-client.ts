import type { SignalingMessage, SignalingMessageType } from "./types.js";

type MessageHandler = (msg: SignalingMessage) => void;

/**
 * WebSocket client for the Null signaling server.
 *
 * Peers connect briefly to exchange WebRTC handshake data (SDP offer/answer +
 * ICE candidates). After the WebRTC data channel is established, the signaling
 * connection can be closed — it is only needed for the initial handshake.
 *
 * The WebSocket constructor is injected so that:
 *   - Browsers and React Native use globalThis.WebSocket
 *   - Node.js (tests, Electron main) can pass the `ws` library constructor
 *
 * SECURITY: The server validates Ethereum address format but does NOT verify
 * the `from` field signature. Post-MVP: sign the SDP payload with the private
 * key so recipients can verify sender identity.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler[]>();
  private openResolve: (() => void) | null = null;
  private openReject: ((err: unknown) => void) | null = null;

  constructor(
    readonly url: string,
    readonly myAddress: string,
    private readonly WSImpl: new (url: string) => WebSocket = globalThis.WebSocket
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.openResolve = resolve;
      this.openReject = reject;
      this.ws = new this.WSImpl(this.url);

      this.ws.onopen = () => {
        // Register this peer's address with the signaling server
        this.send({ type: "register", payload: null, from: this.myAddress });
        this.openResolve?.();
      };

      this.ws.onerror = (e: Event) => {
        this.openReject?.(new Error(`SignalingClient connection error to ${this.url}`));
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as SignalingMessage;
          const listeners = this.handlers.get(msg.type) ?? [];
          for (const fn of listeners) fn(msg);
        } catch {
          // Malformed message — silently drop
        }
      };

      this.ws.onclose = () => {
        this.emit("disconnected", { type: "peer-unavailable", payload: null });
      };
    });
  }

  on(type: SignalingMessageType | "disconnected", handler: MessageHandler): void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler]);
  }

  off(type: SignalingMessageType | "disconnected", handler: MessageHandler): void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(
      type,
      existing.filter((h) => h !== handler)
    );
  }

  send(msg: SignalingMessage): void {
    if (this.ws?.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private emit(type: string, msg: SignalingMessage): void {
    const listeners = this.handlers.get(type) ?? [];
    for (const fn of listeners) fn(msg);
  }
}
