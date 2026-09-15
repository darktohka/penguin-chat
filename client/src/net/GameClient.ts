import { Emitter } from "../core/Emitter";
import { defaultSocketUrl, Socket } from "./Socket";
import { Player } from "./Player";
import type {
  CritterDescriptor,
  Limits,
  PlayerSnapshot,
  RawFrame,
} from "../core/types";

/** Messages that `GameClient` emits for the UI layer to consume. */
export interface GameEvents {
  connected: { type: "connected" };
  disconnected: { type: "disconnected" };
  loggedIn: {
    type: "loggedIn";
    playerId: string;
    critter: CritterDescriptor | null;
    roles: string[];
    limits: Limits | null;
  };
  joined: {
    type: "joined";
    roomId: string;
    players: Player[];
    navmesh: unknown;
    triggers: unknown;
    props: unknown;
    room: Record<string, unknown>;
  };
  playerAdded: { type: "playerAdded"; player: Player };
  playerRemoved: { type: "playerRemoved"; playerId: string };
  playerMoved: { type: "playerMoved"; playerId: string; x: number; y: number };
  chat: { type: "chat"; playerId: string; message: string };
  emote: { type: "emote"; playerId: string; emote: string };
  playAnimation: { type: "playAnimation"; target: string; frame: number };
  error: { type: "error"; code?: string; message?: string };
  warn: { type: "warn"; code?: string; message?: string };
  message: {
    type: "message";
    style?: string;
    title?: string;
    text?: string;
    console?: boolean;
  };
  log: { type: "log"; message: string };
  info: { type: "info"; message: string };
}

/** Options for constructing a `GameClient`. */
export interface GameClientOptions {
  url?: string;
  game?: string;
}

/** Keys on which client-side rate limits are tracked. */
type CooldownKey = "move" | "chat" | "emote" | "join";

/**
 * High-level game client: owns a `Socket`, decodes server frames into typed
 * domain events and tracks local player state, limits and cooldowns.
 */
export class GameClient extends Emitter<GameEvents> {
  private transport: Socket;
  private readonly game: string | undefined;

  private _playerId: string | null = null;
  private _players = new Map<string, Player>();
  private _navmesh: unknown = null;
  private _critter: CritterDescriptor | null = null;
  private _roles: string[] = [];
  private _limits: Limits | null = null;
  private _lastSent: Record<CooldownKey, number> = {
    move: 0,
    chat: 0,
    emote: 0,
    join: 0,
  };

  constructor(options: GameClientOptions = {}) {
    super();
    this.transport = new Socket(options.url || defaultSocketUrl());
    this.game = options.game;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.transport.on("login", (raw) => {
      const frame = raw as unknown as { data: LoginData };
      const data = frame.data;
      this._playerId = data.id;
      this._critter = data.critter;
      this._roles = data.roles;
      this._limits = data.limits;
      this.emit("loggedIn", {
        type: "loggedIn",
        playerId: data.id,
        critter: data.critter,
        roles: data.roles,
        limits: data.limits,
      });
    });

    this.transport.on("join", (raw) => {
      const frame = raw as unknown as { data: JoinData };
      const data = frame.data;
      this._navmesh = data.navmesh;
      this._players.clear();

      const players: Player[] = [];
      for (const entry of data.players) {
        const player = new Player({
          id: entry.id,
          nickname: entry.nickname ?? entry.critter?.nickname,
          x: entry.x,
          y: entry.y,
          critter: entry.critter,
        });
        this._players.set(entry.id, player);
        players.push(player);
      }

      const {
        type: roomId,
        id: _id,
        players: _players,
        triggers,
        props,
        ...room
      } = data;
      this.emit("joined", {
        type: "joined",
        roomId,
        players,
        navmesh: data.navmesh,
        triggers,
        props,
        room,
      });
    });

    this.transport.on("A", (raw) => {
      const frame = raw as unknown as {
        i: string;
        u?: string;
        n?: string;
        x: number;
        y: number;
        c?: { t?: string; o?: Record<string, unknown> };
      };
      const critter: CritterDescriptor | undefined = frame.c
        ? { type: frame.c.t, outfit: frame.c.o }
        : undefined;
      const player = new Player({
        id: frame.i,
        username: frame.u,
        nickname: frame.n,
        x: frame.x,
        y: frame.y,
        critter,
      });
      this._players.set(frame.i, player);
      this.emit("playerAdded", { type: "playerAdded", player });
    });

    this.transport.on("R", (raw) => {
      const frame = raw as unknown as { i: string };
      this._players.delete(frame.i);
      this.emit("playerRemoved", { type: "playerRemoved", playerId: frame.i });
    });

    this.transport.on("X", (raw) => {
      const frame = raw as unknown as { i: string; x: number; y: number };
      const player = this._players.get(frame.i);
      if (player) player.setTarget(frame.x, frame.y);
      this.emit("playerMoved", {
        type: "playerMoved",
        playerId: frame.i,
        x: frame.x,
        y: frame.y,
      });
    });

    this.transport.on("C", (raw) => {
      const frame = raw as unknown as { i: string; m: string };
      this.emit("chat", { type: "chat", playerId: frame.i, message: frame.m });
    });

    this.transport.on("E", (raw) => {
      const frame = raw as unknown as { i: string; e: string };
      this.emit("emote", { type: "emote", playerId: frame.i, emote: frame.e });
    });

    this.transport.on("P", (raw) => {
      const frame = raw as unknown as { t: string; f: number };
      this.emit("playAnimation", {
        type: "playAnimation",
        target: frame.t,
        frame: frame.f,
      });
    });

    this.transport.on("error", (raw) => {
      const frame = raw as unknown as { code?: string; message?: string };
      this.emit("error", {
        type: "error",
        code: frame.code,
        message: frame.message,
      });
    });

    this.transport.on("warn", (raw) => {
      const frame = raw as unknown as { code?: string; message?: string };
      this.emit("warn", {
        type: "warn",
        code: frame.code,
        message: frame.message,
      });
    });

    this.transport.on("message", (raw) => {
      const frame = raw as unknown as {
        style?: string;
        title?: string;
        text?: string;
        console?: boolean;
      };
      this.emit("message", {
        type: "message",
        style: frame.style,
        title: frame.title,
        text: frame.text,
        console: frame.console,
      });
    });

    this.transport.on("log", (raw) => {
      const frame = raw as unknown as { message: string };
      this.emit("log", { type: "log", message: frame.message });
    });

    this.transport.on("info", (raw) => {
      const frame = raw as unknown as { message: string };
      this.emit("info", { type: "info", message: frame.message });
    });

    this.transport.on("close", () => {
      this.emit("disconnected", { type: "disconnected" });
    });
  }

  async connect(): Promise<void> {
    await this.transport.connect();
    this.emit("connected", { type: "connected" });
  }

  /** Token login. Always falls back to guest access on this server. */
  verify(token: string): void {
    this.transport.send({ type: "verify", token, ...this.gameField() });
  }

  /** Anonymous login. Optional nickname is forwarded as `nickname`. */
  guest(nickname?: string): void {
    this.transport.send({
      type: "guest",
      ...(nickname ? { nickname } : {}),
      ...this.gameField(),
    });
  }

  private gameField(): { game?: string } {
    return this.game ? { game: this.game } : {};
  }

  /** Send a move, honoring the server-advertised minimum distance and cooldown. */
  move(x: number, y: number): void {
    const minDistance = this._limits?.move.minDistance;
    const local = this.localPlayer;
    if (minDistance != null && local) {
      const distance = Math.hypot(x - local.targetX, y - local.targetY);
      if (distance < minDistance) {
        console.warn(
          `[socket] move ignored: distance ${distance.toFixed(1)} below minDistance ${minDistance}`,
        );
        return;
      }
    }
    if (this.checkCooldown("move")) {
      this.transport.send({ type: "move", x, y });
    }
  }

  /** Send a chat message. Returns whether it was dispatched. */
  chat(message: string): boolean {
    const maxLength = this._limits?.chat.maxLength;
    if (maxLength != null && message.length > maxLength) {
      console.warn(
        `[socket] chat ignored: ${message.length} chars exceeds maxLength ${maxLength}`,
      );
      return false;
    }
    if (!this.checkCooldown("chat")) return false;
    this.transport.send({ type: "chat", message });
    return true;
  }

  /** Send an emote. Unreachable from the archived UI but kept for parity. */
  emote(emote: string): void {
    const maxLength = this._limits?.emote.maxLength;
    if (maxLength != null && emote.length > maxLength) {
      console.warn(
        `[socket] emote ignored: ${emote.length} chars exceeds maxLength ${maxLength}`,
      );
      return;
    }
    if (this.checkCooldown("emote")) {
      this.transport.send({ type: "emote", emote });
    }
  }

  /** Milliseconds remaining before another action of `key` is allowed. */
  cooldownRemaining(key: CooldownKey): number {
    const cooldown = this._limits?.[key].cooldown ?? 0;
    return Math.max(0, cooldown - (Date.now() - this._lastSent[key]));
  }

  private checkCooldown(key: CooldownKey): boolean {
    const remaining = this.cooldownRemaining(key);
    if (remaining > 0) {
      console.warn(
        `[socket] ${key} ignored: cooldown ${remaining}ms remaining`,
      );
      return false;
    }
    this._lastSent[key] = Date.now();
    return true;
  }

  /**
   * Enter `room`, or switch rooms. Honors the server-advertised join cooldown.
   * `critterType` asks the server to register this player as that critter.
   */
  join(room: string, critterType?: string): boolean {
    if (!this.checkCooldown("join")) return false;
    this.transport.send({
      type: "join",
      room,
      ...(critterType ? { critterType } : {}),
    });
    return true;
  }

  /** Trigger a play animation. Unreachable from the archived UI. */
  trigger(): void {
    this.transport.send({ type: "trigger" });
  }

  disconnect(): void {
    this.transport.disconnect();
  }

  get playerId(): string | null {
    return this._playerId;
  }

  get players(): Map<string, Player> {
    return this._players;
  }

  get localPlayer(): Player | undefined {
    return this._playerId ? this._players.get(this._playerId) : undefined;
  }

  get navmesh(): unknown {
    return this._navmesh;
  }

  get critter(): CritterDescriptor | null {
    return this._critter;
  }

  get roles(): string[] {
    return this._roles;
  }

  get limits(): Limits | null {
    return this._limits;
  }

  get isConnected(): boolean {
    return this.transport.isConnected;
  }
}

/* Internal shapes for untyped server frames, kept close to the decoder. ------ */

interface LoginData {
  id: string;
  critter: CritterDescriptor;
  roles: string[];
  limits: Limits;
}

interface JoinData {
  type: string;
  id: string;
  players: PlayerSnapshot[];
  navmesh: unknown;
  triggers: unknown[];
  props: unknown[];
  margin?: number;
  [key: string]: unknown;
}

export type { RawFrame };
