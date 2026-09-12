import { Container, Graphics, Text, type Spritesheet } from "pixi.js";
import { gsap } from "gsap";
import {
  CHAT_INPUT_HEIGHT,
  CHAT_INPUT_LEFT,
  CHAT_INPUT_MAX_LENGTH,
  CHAT_INPUT_WIDTH,
  DISCONNECT_BUTTON_POS,
  FONT_UI,
  GAME_HEIGHT,
  GAME_WIDTH,
  LOG_BACKGROUND_ALPHA,
  LOG_BACKGROUND_COLOR,
  LOG_BORDER_WIDTH,
  LOG_LATEST_COLOR,
  LOG_LINE_COUNT,
  LOG_LINE_HEIGHT,
  LOG_OLDER_COLOR,
  LOG_PANEL_HEIGHT,
  LOG_PANEL_WIDTH,
  LOG_PANEL_X,
  LOG_X,
  LOG_Y,
  LOG_BUTTON_POS,
  SEND_BUTTON_POS,
  TOOLBAR_Y,
} from "../core/constants";
import type { GameClient, GameEvents } from "../net/GameClient";
import { IconButton } from "../pixi/IconButton";
import { Penguin } from "./Penguin";

/** Clamp a value to `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** `joined` payload passed to the world. Structurally matches `GameEvents['joined']`. */
export type JoinPayload = GameEvents["joined"];

/**
 * The in-room scene: the white world, the chat log panel, the toolbar (HTML
 * input plus Pixi icon buttons) and all live socket subscriptions.
 */
export class World extends Container {
  private readonly socket: GameClient;
  private readonly spritesheet: Spritesheet;
  private readonly players = new Map<string, Penguin>();
  private readonly playerLayer = new Container();
  private readonly logContainer = new Container();
  private readonly toolbar = new Container();
  private readonly logLines: string[] = [];
  private readonly logTexts: Text[] = [];
  private readonly names = new Map<string, string>();
  private readonly leaving = new Map<
    Penguin,
    ReturnType<typeof gsap.timeline>
  >();

  private chatInput!: HTMLInputElement;
  private sendButton!: IconButton;
  private chatCooldownTimer: ReturnType<typeof gsap.delayedCall> | undefined;
  private margin = 0;
  private unsubscribers: Array<() => void> = [];

  /** Called when the user clicks the disconnect button. */
  public onDisconnect: (() => void) | undefined;

  private readonly keyHandler = (event: KeyboardEvent): void =>
    this.handleKey(event);
  private readonly visibilityHandler = (): void => {
    if (!document.hidden) this.resync();
  };

  constructor(socket: GameClient, spritesheet: Spritesheet) {
    super();
    this.socket = socket;
    this.spritesheet = spritesheet;
  }

  /** Build the scene and subscribe to the room. */
  init(container: HTMLElement, join: JoinPayload): void {
    this.margin = (join.room.margin as number | undefined) ?? 0;
    this.buildWorld();
    this.buildChatLog();
    this.buildToolbar(container);
    this.bindSocket();

    for (const player of join.players) {
      this.addPlayer(
        player.id,
        player.nickname,
        player.x,
        player.y,
        player.id === this.socket.playerId,
      );
    }

    this.addChatLine("Welcome to Experimental Penguins");
    this.addChatLine("Select your character with your mouse to move.");

    window.addEventListener("keydown", this.keyHandler);
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  private buildWorld(): void {
    const backdrop = new Graphics();
    backdrop.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.fill(0xffffff);
    backdrop.eventMode = "static";
    backdrop.cursor = "pointer";
    backdrop.on("pointerdown", (event) => {
      const { x, y } = event.global;
      const targetX = clamp(
        Math.round(x),
        this.margin,
        GAME_WIDTH - this.margin,
      );
      const targetY = clamp(
        Math.round(y),
        this.margin,
        GAME_HEIGHT - this.margin,
      );
      this.socket.move(targetX, targetY);
    });

    this.addChild(backdrop, this.playerLayer);
  }

  private buildChatLog(): void {
    const panel = new Graphics();
    panel.rect(LOG_PANEL_X, LOG_Y, LOG_PANEL_WIDTH, LOG_PANEL_HEIGHT);
    panel.fill({ color: LOG_BACKGROUND_COLOR, alpha: LOG_BACKGROUND_ALPHA });
    panel.stroke({ color: 0x000000, width: LOG_BORDER_WIDTH });
    this.logContainer.addChild(panel);

    for (let i = 0; i < LOG_LINE_COUNT; i++) {
      const line = new Text({
        text: "",
        style: {
          fontFamily: FONT_UI,
          fontSize: 11,
          fill: i === LOG_LINE_COUNT - 1 ? LOG_LATEST_COLOR : LOG_OLDER_COLOR,
        },
      });
      line.position.set(LOG_X, LOG_Y + i * LOG_LINE_HEIGHT);
      this.logTexts.push(line);
      this.logContainer.addChild(line);
    }

    this.addChild(this.logContainer);
  }

  private buildToolbar(container: HTMLElement): void {
    container.style.position = "relative";

    this.chatInput = document.createElement("input");
    this.chatInput.type = "text";
    this.chatInput.maxLength = CHAT_INPUT_MAX_LENGTH;
    Object.assign(this.chatInput.style, {
      position: "absolute",
      left: `${CHAT_INPUT_LEFT}px`,
      top: `${TOOLBAR_Y}px`,
      width: `${CHAT_INPUT_WIDTH}px`,
      height: `${CHAT_INPUT_HEIGHT}px`,
      boxSizing: "border-box",
      font: "12px Arial, sans-serif",
      border: "1px solid #000",
      borderRadius: "0",
      background: "rgba(255, 255, 255, 0.6)",
      margin: "0",
      padding: "0 4px",
      outline: "none",
    });
    container.appendChild(this.chatInput);

    this.sendButton = new IconButton({
      icon: "send",
      onClick: () => this.sendChat(),
    });
    this.sendButton.position.set(SEND_BUTTON_POS.x, SEND_BUTTON_POS.y);
    this.toolbar.addChild(this.sendButton);

    const logButton = new IconButton({
      icon: "log",
      onClick: () => {
        this.logContainer.visible = !this.logContainer.visible;
      },
    });
    logButton.position.set(LOG_BUTTON_POS.x, LOG_BUTTON_POS.y);
    this.toolbar.addChild(logButton);

    const disconnectButton = new IconButton({
      icon: "disconnect",
      onClick: () => this.onDisconnect?.(),
    });
    disconnectButton.position.set(
      DISCONNECT_BUTTON_POS.x,
      DISCONNECT_BUTTON_POS.y,
    );
    this.toolbar.addChild(disconnectButton);
    this.addChild(this.toolbar);
  }

  private bindSocket(): void {
    this.unsubscribers.push(
      this.socket.on("playerAdded", (event) => {
        this.addPlayer(
          event.player.id,
          event.player.nickname,
          event.player.x,
          event.player.y,
          !document.hidden,
        );
      }),
      this.socket.on("playerRemoved", (event) => {
        const penguin = this.players.get(event.playerId);
        if (!penguin) return;
        this.players.delete(event.playerId);
        gsap.killTweensOf(penguin);
        if (event.playerId === this.socket.playerId || document.hidden) {
          this.removePenguin(penguin);
        } else {
          const drop = penguin.playDrop();
          this.leaving.set(penguin, drop);
          drop.then(() => {
            if (this.leaving.has(penguin)) this.removePenguin(penguin);
          });
        }
      }),
      this.socket.on("playerMoved", (event) => {
        const penguin = this.players.get(event.playerId);
        if (!penguin) return;
        if (document.hidden) penguin.setPosition(event.x, event.y);
        else penguin.moveTo(event.x, event.y);
      }),
      this.socket.on("chat", (event) => {
        if (event.playerId !== this.socket.playerId) {
          this.showChat(event.playerId, event.message);
        }
      }),
      this.socket.on("info", (event) => this.addChatLine(event.message)),
      this.socket.on("message", (event) => {
        if (event.text) this.addChatLine(event.text);
      }),
    );
  }

  private addPlayer(
    id: string,
    nickname: string | undefined,
    x: number,
    y: number,
    playIntro: boolean,
  ): void {
    if (this.players.has(id)) {
      const existing = this.players.get(id)!;
      gsap.killTweensOf(existing);
      this.playerLayer.removeChild(existing);
      existing.destroy();
    }

    const isLocal = id === this.socket.playerId;
    this.names.set(id, nickname ?? id);
    const penguin = new Penguin(
      id,
      nickname ?? id,
      x,
      y,
      this.spritesheet,
      isLocal,
    );
    this.players.set(id, penguin);
    this.playerLayer.addChild(penguin);
    if (playIntro) penguin.playIntro();
  }

  private removePenguin(penguin: Penguin): void {
    this.leaving.delete(penguin);
    this.playerLayer.removeChild(penguin);
    penguin.destroy();
  }

  private resync(): void {
    for (const penguin of this.players.values()) penguin.resync();
    for (const [penguin, drop] of [...this.leaving]) {
      drop.kill();
      this.removePenguin(penguin);
    }
    this.startChatCooldown();
  }

  private addChatLine(text: string): void {
    this.logLines.push(text);
    if (this.logLines.length > LOG_LINE_COUNT) this.logLines.shift();
    const offset = LOG_LINE_COUNT - this.logLines.length;
    for (let i = 0; i < LOG_LINE_COUNT; i++) {
      this.logTexts[i].text = this.logLines[i - offset] ?? "";
    }
  }

  private showChat(playerId: string, message: string): void {
    const name =
      this.names.get(playerId) ??
      this.socket.players.get(playerId)?.nickname ??
      playerId;
    this.addChatLine(`${name}: ${message}`);
    this.players.get(playerId)?.say(message);
  }

  private sendChat(): void {
    const message = this.chatInput.value.trim();
    if (!message) return;
    if (!this.socket.chat(message)) return;
    this.chatInput.value = "";
    if (this.socket.playerId) this.showChat(this.socket.playerId, message);
    this.startChatCooldown();
  }

  private startChatCooldown(): void {
    this.chatCooldownTimer?.kill();
    const remaining = this.socket.cooldownRemaining("chat");
    if (remaining <= 0) {
      this.chatCooldownTimer = undefined;
      this.sendButton.setEnabled(true);
      return;
    }
    this.sendButton.setEnabled(false);
    this.chatCooldownTimer = gsap.delayedCall(remaining / 1000, () => {
      this.chatCooldownTimer = undefined;
      this.sendButton.setEnabled(true);
    });
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key !== "Enter") return;
    if (document.activeElement === this.chatInput) {
      this.sendChat();
    } else {
      event.preventDefault();
      this.chatInput.focus();
    }
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    window.removeEventListener("keydown", this.keyHandler);
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.chatCooldownTimer?.kill();
    this.chatCooldownTimer = undefined;
    this.chatInput?.remove();

    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];

    for (const penguin of this.players.values()) gsap.killTweensOf(penguin);
    this.players.clear();
    this.names.clear();

    for (const [penguin, drop] of this.leaving) {
      drop.kill();
      gsap.killTweensOf(penguin);
      penguin.destroy();
    }
    this.leaving.clear();

    super.destroy(options);
  }
}
