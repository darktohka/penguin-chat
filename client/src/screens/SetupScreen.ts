import { Container, Text } from "pixi.js";
import {
  BUTTON_FILL,
  BUTTON_HOVER_FILL,
  BUTTON_TEXT_COLOR,
  DEFAULT_NICKNAME,
  DEFAULT_ROOM_ID,
  FONT_UI,
  MAX_NICKNAME_LENGTH,
  MENU_BUTTON_HEIGHT,
  MENU_BUTTON_WIDTH,
  SETUP_INPUT_HEIGHT,
  SETUP_INPUT_POS,
  SETUP_INPUT_WIDTH,
  SETUP_NEXT_BUTTON_POS,
  SETUP_PROMPT_FONT_SIZE,
  SETUP_PROMPT_LINE_HEIGHT,
  SETUP_PROMPT_POS,
  SETUP_PROMPT_TEXT,
  SETUP_RADIO_FIRST_Y,
  SETUP_RADIO_X,
} from "../core/constants";
import { Button } from "../pixi/Button";
import { RoomSelector } from "../pixi/RoomSelector";
import { BaseScreen } from "./BaseScreen";

/**
 * The pre-join setup screen: nickname entry plus a vertical room list,
 * restoring the archived SWF's single name + room-choice screen.
 */
export class SetupScreen extends BaseScreen {
  /** Called with the trimmed nickname (or `undefined` when blank) and room id. */
  public onNext:
    | ((username: string | undefined, roomId: string) => void)
    | undefined;

  private roomSelector!: RoomSelector;
  private nameInput!: HTMLInputElement;

  constructor(private readonly container: HTMLElement) {
    super();
  }

  override async init(): Promise<void> {
    await super.init();

    const prompt = new Text({
      text: SETUP_PROMPT_TEXT,
      style: {
        fontFamily: FONT_UI,
        fontWeight: "bold",
        fontSize: SETUP_PROMPT_FONT_SIZE,
        lineHeight: SETUP_PROMPT_LINE_HEIGHT,
        align: "center",
        fill: 0x000000,
      },
    });
    prompt.anchor.set(0.5, 0);
    prompt.position.set(SETUP_PROMPT_POS.x, SETUP_PROMPT_POS.y);
    this.addChild(prompt);

    this.buildNameInput();
    this.buildRoomSelector();
    this.buildNextButton();
  }

  /** Append the nickname `<input>` as a DOM overlay, like the chat toolbar. */
  private buildNameInput(): void {
    this.container.style.position = "relative";

    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.maxLength = MAX_NICKNAME_LENGTH;
    this.nameInput.placeholder = DEFAULT_NICKNAME;
    this.nameInput.onkeydown = (event) => {
      if (event.key === "Enter") this.submit();
    };
    Object.assign(this.nameInput.style, {
      position: "absolute",
      left: `${SETUP_INPUT_POS.x}px`,
      top: `${SETUP_INPUT_POS.y}px`,
      width: `${SETUP_INPUT_WIDTH}px`,
      height: `${SETUP_INPUT_HEIGHT}px`,
      boxSizing: "border-box",
      font: "12px Arial, sans-serif",
      border: "1px solid #000",
      borderRadius: "0",
      background: "rgba(255, 255, 255, 0.6)",
      margin: "0",
      padding: "0 4px",
      outline: "none",
    });
    this.container.appendChild(this.nameInput);
    this.nameInput.focus();
  }

  private buildRoomSelector(): void {
    this.roomSelector = new RoomSelector({ roomId: DEFAULT_ROOM_ID });
    this.roomSelector.position.set(SETUP_RADIO_X, SETUP_RADIO_FIRST_Y);
    this.addChild(this.roomSelector);
  }

  private buildNextButton(): void {
    const next = new Button({
      label: "Next",
      width: MENU_BUTTON_WIDTH,
      height: MENU_BUTTON_HEIGHT,
      fill: BUTTON_FILL,
      hoverFill: BUTTON_HOVER_FILL,
      textColor: BUTTON_TEXT_COLOR,
      onClick: () => this.submit(),
    });
    next.position.set(SETUP_NEXT_BUTTON_POS.x, SETUP_NEXT_BUTTON_POS.y);
    this.addChild(next);
  }

  private submit(): void {
    const username = this.nameInput.value.trim();
    this.onNext?.(username || undefined, this.roomSelector.selectedRoomId);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.nameInput?.remove();
    if (this.nameInput) this.nameInput.onkeydown = null;
    super.destroy(options);
  }
}
