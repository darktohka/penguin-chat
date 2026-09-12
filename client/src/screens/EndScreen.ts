import { Text } from "pixi.js";
import {
  BUTTON_FILL,
  BUTTON_HOVER_FILL,
  BUTTON_TEXT_COLOR,
  END_TEXT_POS,
  FONT_UI,
  MENU_BUTTON_HEIGHT,
  MENU_BUTTON_POS,
  MENU_BUTTON_WIDTH,
} from "../core/constants";
import { Button } from "../pixi/Button";
import { BaseScreen } from "./BaseScreen";

/**
 * A terminal screen with a message and a "Try Again" button, used for both the
 * logged-off and server-unavailable outcomes.
 */
export class EndScreen extends BaseScreen {
  public onTryAgain: (() => void) | undefined;

  constructor(private readonly message: string) {
    super();
  }

  override async init(): Promise<void> {
    await super.init();

    const label = new Text({
      text: this.message,
      style: {
        fontFamily: FONT_UI,
        fontWeight: "bold",
        fontSize: 14,
        fill: 0x000000,
        align: "center",
      },
    });
    label.anchor.set(0.5);
    label.position.set(END_TEXT_POS.x, END_TEXT_POS.y);
    this.addChild(label);

    const tryAgain = new Button({
      label: "Try Again",
      width: MENU_BUTTON_WIDTH,
      height: MENU_BUTTON_HEIGHT,
      fill: BUTTON_FILL,
      hoverFill: BUTTON_HOVER_FILL,
      textColor: BUTTON_TEXT_COLOR,
      onClick: () => this.onTryAgain?.(),
    });
    tryAgain.position.set(MENU_BUTTON_POS.x, MENU_BUTTON_POS.y);
    this.addChild(tryAgain);
  }
}
