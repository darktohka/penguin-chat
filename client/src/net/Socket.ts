import { Emitter } from "../core/Emitter";
import type { ClientFrame, RawFrame } from "../core/types";

/** The client resolves the socket URL from the page origin, same-origin `/ws`. */
export function defaultSocketUrl(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

/** Events emitted by the transport; every server frame is also re-emitted by type. */
export interface SocketEvents extends Record<
  string,
  RawFrame | { type: string }
> {
  close: { type: "close" };
}

/** Log an outbound frame, matching the archived `[SOCKET]⬆` console output. */
function logOutgoing(...args: unknown[]): void {
  console.log(
    "%c[SOCKET]⬆%c",
    "color: green; font-weight: bold",
    "color: inherit",
    ...args,
  );
}

/** Log an inbound frame, matching the archived `[SOCKET]⬇` console output. */
function logIncoming(...args: unknown[]): void {
  console.log(
    "%c[SOCKET]⬇%c",
    "color: dodgerblue; font-weight: bold",
    "color: inherit",
    ...args,
  );
}

/**
 * Low-level WebSocket transport: connects, parses JSON frames, dispatches them
 * by `type` (plus a `*` catch-all) and re-emits `close` on disconnect.
 */
export class Socket extends Emitter<SocketEvents> {
  private ws: WebSocket | null = null;
  public readonly url: string;

  constructor(url: string = defaultSocketUrl()) {
    super();
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log(`[Socket] Connected to ${this.url}`);
        resolve();
      };

      this.ws.onerror = (event) => {
        console.error("[Socket] Error:", event);
        reject(event);
      };

      this.ws.onclose = () => {
        console.log("[Socket] Disconnected");
        this.emit("close", { type: "close" });
      };

      this.ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const frame = JSON.parse(event.data) as RawFrame;
          this.logMessage(frame);
          this.emit(frame.type, frame);
          this.emit("*", frame);
        } catch (error) {
          console.error("[Socket] Parse error:", error);
        }
      };
    });
  }

  /** Send a frame. Returns `false` (and warns) when the socket is not open. */
  send(frame: ClientFrame): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logOutgoing(frame);
      this.ws.send(JSON.stringify(frame));
      return true;
    }
    console.error("[Socket]↓ Not connected");
    return false;
  }

  /** Compact console formatting for the short in-room frames. */
  private logMessage(frame: RawFrame): void {
    switch (frame.type) {
      case "X":
        logIncoming(`[X] ${frame.i} -> ${frame.x},${frame.y}`);
        break;
      case "A":
        logIncoming(`[A] ${frame.i} @ ${frame.x},${frame.y}`);
        break;
      case "R":
        logIncoming(`[R] ${frame.i}`);
        break;
      case "C":
        logIncoming(`[C] ${frame.i}: ${frame.m}`);
        break;
      case "E":
        logIncoming(`[E] ${frame.i}: ${frame.e}`);
        break;
      default:
        logIncoming(frame);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
