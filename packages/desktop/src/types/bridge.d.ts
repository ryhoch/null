export interface NullBridge {
  /** process.platform from main — renderer can't access it directly in sandbox mode */
  platform: string;

  /** WebSocket URL of the signaling server */
  signalingUrl: string;

  /** LevelDB storage — all ops run in main process, bridged via IPC */
  storage: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
    del(key: string): Promise<void>;
    list(prefix: string): Promise<Array<{ key: string; value: string }>>;
  };

  /** OS utilities */
  system: {
    getDataPath(): Promise<string>;
    openFileDialog(
      filters: Array<{ name: string; extensions: string[] }>
    ): Promise<string | null>;
    readFileBytes(path: string): Promise<Uint8Array>;
    copyToClipboard(text: string): Promise<void>;
    saveFile(fileName: string, bytes: number[]): Promise<string>;
    /** Write wallet address+pubkey to shared location for Nova to read. Never includes private key. */
    writeIdentity(address: string, pubkeyHex: string): Promise<void>;
    /** Launch Nova desktop app via nova:// protocol. */
    launchNova(): Promise<void>;
  };

  /**
   * Register a listener for incoming null:// deep links.
   * Called when the OS opens a null:// URL while the app is running.
   */
  onProtocolLink(callback: (url: string) => void): void;
}

declare global {
  interface Window {
    nullBridge: NullBridge;
  }
}
