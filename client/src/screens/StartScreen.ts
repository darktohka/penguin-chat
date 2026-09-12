import { Container } from "pixi.js";
import {
  BUTTON_FILL,
  BUTTON_HOVER_FILL,
  BUTTON_TEXT_COLOR,
  MENU_BUTTON_HEIGHT,
  MENU_BUTTON_POS,
  MENU_BUTTON_WIDTH,
} from "../core/constants";
import { loadChrome } from "../pixi/assets";
import { Button } from "../pixi/Button";
import { createFooter, createTitle } from "./chrome";

/**
 * The title screen: artwork, footer and a centered "Play" button.
 */
export class StartScreen extends Container {
  public onPlay: (() => void) | undefined;

  async init(): Promise<void> {
    const { title, rocketsnail } = await loadChrome();
    this.addChild(createTitle(title));
    this.addChild(createFooter(rocketsnail));

    const playButton = new Button({
      label: "Play",
      width: MENU_BUTTON_WIDTH,
      height: MENU_BUTTON_HEIGHT,
      fill: BUTTON_FILL,
      hoverFill: BUTTON_HOVER_FILL,
      textColor: BUTTON_TEXT_COLOR,
      onClick: () => this.onPlay?.(),
    });
    playButton.position.set(MENU_BUTTON_POS.x, MENU_BUTTON_POS.y);
    this.addChild(playButton);
  }
}
