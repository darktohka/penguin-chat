import {
  Container,
  Graphics,
  RenderLayer,
  Sprite,
  Text,
  type Spritesheet,
} from "pixi.js";
import { gsap } from "gsap/gsap-core";
import {
  CHAT_INPUT_HEIGHT,
  CHAT_INPUT_LEFT,
  CHAT_INPUT_MAX_LENGTH,
  CHAT_INPUT_WIDTH,
  DEFAULT_ROOM_ID,
  DISCONNECT_BUTTON_POS,
  EXTENDED,
  FONT_UI,
  GAME_HEIGHT,
  GAME_WIDTH,
  HELP_TEXT_COLOR,
  HELP_TEXT_FONT_SIZE,
  HELP_TEXT_LEFT,
  HELP_TEXT_RIGHT,
  HELP_TEXT_TOP,
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
  RES_BUTTON_POS,
  RES_ZOOM_LEVELS,
  NORTHPOLE_ORIGIN,
  NORTHPOLE_SVG_OFFSET,
  SEND_BUTTON_POS,
  TOOLBAR_Y,
  WAVE_BOB_SECONDS,
  WAVE_FRAME_A,
  WAVE_FRAME_B,
  WORLD_ROOM_RADIO_FIRST_Y,
  WORLD_ROOM_RADIO_X,
} from "../core/constants";
import type { GameClient, GameEvents } from "../net/GameClient";
import { playPop } from "../audio/sfx";
import { loadRoomAssets, type RoomAssets } from "../pixi/assets";
import { IconButton, type IconHelp } from "../pixi/IconButton";
import { RoomSelector } from "../pixi/RoomSelector";
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
  private readonly backgroundLayer = new Container();
  private readonly playerLayer = new Container();
  private readonly foregroundLayer = new Container();
  /** Top-most layer: penguin name labels and speech balloons render here. */
  private readonly overlayLayer = new RenderLayer();
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
  private helpLabel: Text | undefined;
  private roomSelector: RoomSelector | undefined;
  private roomId = DEFAULT_ROOM_ID;
  private reconnecting = false;
  private chatCooldownTimer: ReturnType<typeof gsap.delayedCall> | undefined;
  private waveTimer: ReturnType<typeof gsap.delayedCall> | undefined;
  private waveOnSecondFrame = false;
  private margin = 0;
  private resolutionIndex = 0;
  private container: HTMLElement | undefined;
  private unsubscribers: Array<() => void> = [];

  /** Called when the user clicks the disconnect button. */
  public onDisconnect: (() => void) | undefined;

  /** Called when the user picks a different room from the in-room selector. */
  public onRoomChange: ((roomId: string) => void) | undefined;

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
  async init(container: HTMLElement, join: JoinPayload): Promise<void> {
    this.margin = (join.room.margin as number | undefined) ?? 0;
    this.roomId = join.roomId;
    this.container = container;
    const room = await loadRoomAssets(join.roomId);
    this.buildWorld(room);
    this.buildChatLog();
    this.buildToolbar(container);
    this.addChild(this.overlayLayer);
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

  private buildWorld(room: RoomAssets): void {
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

    this.addChild(
      backdrop,
      this.backgroundLayer,
      this.playerLayer,
      this.foregroundLayer,
    );
    this.buildRoomArt(room);
  }

  private buildRoomArt(room: RoomAssets): void {
    switch (room.roomId) {
      case "penguin1":
        return;
      case "northpole": {
        const shape = new Sprite(room.northpole);
        shape.position.set(
          NORTHPOLE_ORIGIN.x - NORTHPOLE_SVG_OFFSET.x,
          NORTHPOLE_ORIGIN.y - NORTHPOLE_SVG_OFFSET.y,
        );
        this.backgroundLayer.addChild(shape);
        return;
      }
      case "crashsite": {
        const background = new Sprite(room.crashedBobcat);
        background.position.set(0, GAME_HEIGHT - background.height);
        this.backgroundLayer.addChild(background);

        const wave = new Sprite(room.wave);
        wave.anchor.set(0.5);
        wave.position.set(WAVE_FRAME_A.x, WAVE_FRAME_A.y);
        this.backgroundLayer.addChild(wave);
        this.startWaveBob(wave);

        const foreground = new Sprite(room.bobcatLayer2);
        foreground.position.set(0, GAME_HEIGHT - foreground.height);
        this.foregroundLayer.addChild(foreground);
        return;
      }
      default: {
        const exhaustive: never = room;
        throw new Error(`Unhandled room art: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  private startWaveBob(wave: Sprite): void {
    const bob = (): void => {
      this.waveOnSecondFrame = !this.waveOnSecondFrame;
      const frame = this.waveOnSecondFrame ? WAVE_FRAME_B : WAVE_FRAME_A;
      wave.position.set(frame.x, frame.y);
      this.waveTimer = gsap.delayedCall(WAVE_BOB_SECONDS, bob);
    };
    this.waveTimer = gsap.delayedCall(WAVE_BOB_SECONDS, bob);
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
      help: { text: "Chat with other players", align: "left" },
      onHelp: (help) => this.showHelp(help),
    });
    this.sendButton.position.set(SEND_BUTTON_POS.x, SEND_BUTTON_POS.y);
    this.toolbar.addChild(this.sendButton);

    const logButton = new IconButton({
      icon: "log",
      onClick: () => {
        this.logContainer.visible = !this.logContainer.visible;
      },
      help: { text: "View current log", align: "left" },
      onHelp: (help) => this.showHelp(help),
    });
    logButton.position.set(LOG_BUTTON_POS.x, LOG_BUTTON_POS.y);
    this.toolbar.addChild(logButton);

    if (EXTENDED) {
      const resButton = new IconButton({
        icon: "res",
        onClick: () => this.cycleResolution(),
        help: { text: "Change resolution", align: "left" },
        onHelp: (help) => this.showHelp(help),
      });
      resButton.position.set(RES_BUTTON_POS.x, RES_BUTTON_POS.y);
      this.toolbar.addChild(resButton);
      this.applyResolution();
    }

    const disconnectButton = new IconButton({
      icon: "disconnect",
      onClick: () => this.onDisconnect?.(),
      help: { text: "Disconnect", align: "right" },
      onHelp: (help) => this.showHelp(help),
    });
    disconnectButton.position.set(
      DISCONNECT_BUTTON_POS.x,
      DISCONNECT_BUTTON_POS.y,
    );
    this.toolbar.addChild(disconnectButton);

    if (EXTENDED) {
      this.helpLabel = new Text({
        text: "",
        style: {
          fontFamily: FONT_UI,
          fontSize: HELP_TEXT_FONT_SIZE,
          fill: HELP_TEXT_COLOR,
        },
      });
      this.helpLabel.anchor.set(0, 0);
      this.helpLabel.position.set(HELP_TEXT_LEFT, HELP_TEXT_TOP);
      this.helpLabel.visible = false;
      this.toolbar.addChild(this.helpLabel);
    }

    if (EXTENDED) {
      this.roomSelector = new RoomSelector({
        roomId: this.roomId,
        onSelect: (roomId) => this.requestRoomChange(roomId),
      });
      this.roomSelector.position.set(
        WORLD_ROOM_RADIO_X,
        WORLD_ROOM_RADIO_FIRST_Y,
      );
      this.toolbar.addChild(this.roomSelector);
    }

    this.addChild(this.toolbar);
  }

  /**
   * Ask the app to reconnect into `roomId`; the app tears this screen down and
   * rebuilds it, so a second click arriving before teardown is ignored.
   */
  private requestRoomChange(roomId: string): void {
    if (this.reconnecting || roomId === this.roomId) return;
    this.reconnecting = true;
    this.onRoomChange?.(roomId);
  }

  /** Show (or clear) the gray hover help label next to the toolbar buttons. */
  private showHelp(help: IconHelp | null): void {
    if (!this.helpLabel) return;
    if (!help) {
      this.helpLabel.visible = false;
      return;
    }
    const right = help.align === "right";
    this.helpLabel.text = help.text;
    this.helpLabel.anchor.set(right ? 1 : 0, 0);
    this.helpLabel.position.set(
      right ? HELP_TEXT_RIGHT : HELP_TEXT_LEFT,
      HELP_TEXT_TOP,
    );
    this.helpLabel.visible = true;
  }

  private cycleResolution(): void {
    this.resolutionIndex = (this.resolutionIndex + 1) % RES_ZOOM_LEVELS.length;
    this.applyResolution();
  }

  /**
   * The chat input is an HTML element overlaying the Pixi canvas, so the whole
   * `#app` container is zoomed rather than the canvas alone; that keeps the two
   * aligned and lets the page reflow around the larger canvas.
   */
  private applyResolution(): void {
    this.container?.style.setProperty(
      "zoom",
      String(RES_ZOOM_LEVELS[this.resolutionIndex]),
    );
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
          if (EXTENDED) playPop();
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
      this.overlayLayer,
      isLocal,
    );
    this.players.set(id, penguin);
    this.playerLayer.addChild(penguin);
    if (EXTENDED) playPop();
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
    this.waveTimer?.kill();
    this.waveTimer = undefined;
    this.chatInput?.remove();
    this.container?.style.setProperty("zoom", "1");
    this.container = undefined;

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
