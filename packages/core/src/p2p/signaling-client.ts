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
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler[]>();
  private openResolve: (() => void) | null = null;
  private openReject: ((err: unknown) => void) | null = null;

  private shouldReconnect = false;
  private reconnectDelay = RECONNECT_BASE_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly url: string,
    readonly myAddress: string,
    private readonly WSImpl: new (url: string) => WebSocket = globalThis.WebSocket
  ) {}

  connect(): Promise<void> {
    this.shouldReconnect = true;
    return this.openConnection();
  }

  private openConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.openResolve = resolve;
      this.openReject = reject;
      this.ws = new this.WSImpl(this.url);

      this.ws.onopen = () => {
        this.reconnectDelay = RECONNECT_BASE_MS; // reset backoff on success
        // Register this peer's address with the signaling server
        this.send({ type: "register", payload: null, from: this.myAddress });
        this.openResolve?.();
        this.openResolve = null;
        this.openReject = null;
      };

      this.ws.onerror = (_e: Event) => {
        this.openReject?.(new Error(`SignalingClient connection error to ${this.url}`));
        this.openResolve = null;
        this.openReject = null;
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
        // Reject in-flight connect() promise if it hasn't resolved yet
        this.openReject?.(new Error("SignalingClient closed before open"));
        this.openResolve = null;
        this.openReject = null;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    });
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.shouldReconnect) return;
      void this.openConnection().catch(() => {
        // openConnection will schedule another reconnect via onclose
      });
      // Exponential backoff, capped at max
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    }, this.reconnectDelay);
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
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private emit(type: string, msg: SignalingMessage): void {
    const listeners = this.handlers.get(type) ?? [];
    for (const fn of listeners) fn(msg);
  }
}
