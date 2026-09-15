import type { Application, Container } from "pixi.js";
import {
  CONNECT_DELAY_MS,
  DEFAULT_ROOM_ID,
  EXTENDED,
  GAME_ID,
} from "../core/constants";
import { defaultSocketUrl } from "../net/Socket";
import { GameClient, type GameEvents } from "../net/GameClient";
import { loadIcons, loadSpritesheet } from "../pixi/assets";
import { World } from "../game/World";
import { EndScreen } from "./EndScreen";
import { SetupScreen } from "./SetupScreen";
import { StartScreen } from "./StartScreen";
import { StatusScreen } from "./StatusScreen";

/** Resolves after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for the first `event` from `client`, rejecting on `error` or disconnect.
 */
function once<K extends keyof GameEvents>(
  client: GameClient,
  event: K,
): Promise<GameEvents[K]> {
  return new Promise((resolve, reject) => {
    const unsubscribe: Array<() => void> = [];
    const done = (): void => unsubscribe.forEach((fn) => fn());

    unsubscribe.push(
      client.on(event, (payload) => {
        done();
        resolve(payload);
      }),
      client.on("error", (payload) => {
        done();
        reject(new Error(payload.code ?? payload.message ?? "server error"));
      }),
      client.on("disconnected", () => {
        done();
        reject(new Error("disconnected"));
      }),
    );
  });
}

/**
 * Top-level screen controller and connection lifecycle.
 */
export class App {
  private current: Container | null = null;
  private socket: GameClient | null = null;
  private intentionalDisconnect = false;
  private username: string | undefined;
  private roomId: string = DEFAULT_ROOM_ID;

  constructor(
    private readonly app: Application,
    private readonly container: HTMLElement,
  ) {}

  async start(): Promise<void> {
    await this.goHome();
  }

  private goHome(): Promise<void> {
    return EXTENDED ? this.showSetup() : this.showStart();
  }

  private setScreen(screen: Container): void {
    if (this.current) {
      this.app.stage.removeChild(this.current);
      this.current.destroy({ children: true });
    }
    this.current = screen;
    this.app.stage.addChild(screen);
  }

  private teardownSocket(): void {
    if (this.socket) {
      this.intentionalDisconnect = true;
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private async showStart(): Promise<void> {
    this.teardownSocket();
    const screen = new StartScreen();
    screen.onPlay = () => void this.play(undefined, DEFAULT_ROOM_ID);
    await screen.init();
    this.setScreen(screen);
  }

  private async showSetup(): Promise<void> {
    const screen = new SetupScreen(this.container);
    screen.onNext = (username, roomId) => void this.play(username, roomId);
    await screen.init();
    this.setScreen(screen);
  }

  private async showStatus(message: string): Promise<void> {
    const screen = new StatusScreen(message);
    await screen.init();
    this.setScreen(screen);
  }

  private async showEnd(message: string): Promise<void> {
    this.teardownSocket();
    const screen = new EndScreen(message);
    screen.onTryAgain = () => void this.goHome();
    await screen.init();
    this.setScreen(screen);
  }

  private showLoggedOff(): Promise<void> {
    return this.showEnd("You have successfully\nLogged Off");
  }

  private showUnavailable(): Promise<void> {
    return this.showEnd(
      "Unable to connect to the Server\nPlease try again in a few minutes",
    );
  }

  private async play(
    username: string | undefined,
    roomId: string,
  ): Promise<void> {
    this.username = username;
    this.roomId = roomId;
    await this.showStatus("Connecting to Server");

    const client = new GameClient({ url: defaultSocketUrl(), game: GAME_ID });
    this.socket = client;
    this.intentionalDisconnect = false;
    client.on("disconnected", () => {
      if (!this.intentionalDisconnect && this.socket === client)
        void this.showUnavailable();
    });

    try {
      const loggedIn = once(client, "loggedIn");
      await Promise.all([client.connect(), delay(CONNECT_DELAY_MS)]);
      client.guest(username);
      await loggedIn;
      await this.showStatus("Loading World");

      const joined = once(client, "joined");
      client.join(roomId);
      const [joinPayload, spritesheet] = await Promise.all([
        joined,
        loadSpritesheet(),
        loadIcons(),
        delay(CONNECT_DELAY_MS),
      ]);

      const world = new World(client, spritesheet, this.app.renderer);
      world.onDisconnect = () => {
        this.teardownSocket();
        void this.showLoggedOff();
      };
      world.onRoomChange = (roomId) => void this.switchRoom(roomId);
      await world.init(this.container, joinPayload);
      this.setScreen(world);
    } catch (error) {
      if (this.socket === client) {
        console.error("Connection failed:", error);
        await this.showUnavailable();
      }
    }
  }

  /** Tear down the current session and reconnect into another room. */
  private async switchRoom(roomId: string): Promise<void> {
    if (roomId === this.roomId) return;
    this.teardownSocket();
    await this.play(this.username, roomId);
  }
}
