import { Container, Graphics } from "pixi.js";
import {
  ICON_BUTTON_SIZE,
  ICON_DISABLED_ALPHA,
  ICON_DISABLED_FILL,
  ICON_FILL,
  ICON_HOVER_FILL,
} from "../core/constants";
import { iconSprite } from "./assets";

/** Options for an `IconButton`. */
export interface IconButtonOptions {
  /** Icon alias, one of the keys of `ICON_SOURCES`. */
  icon: string;
  onClick: () => void;
}

/**
 * A 22x22 square icon button with hover and disabled states.
 */
export class IconButton extends Container {
  private readonly background = new Graphics();
  private readonly icon;
  private enabled = true;
  private hovered = false;

  constructor(private readonly options: IconButtonOptions) {
    super();
    this.icon = iconSprite(options.icon);
    this.icon.position.set(ICON_BUTTON_SIZE / 2, ICON_BUTTON_SIZE / 2);

    this.addChild(this.background, this.icon);
    this.redraw();

    this.on("pointerover", () => {
      this.hovered = true;
      this.redraw();
    });
    this.on("pointerout", () => {
      this.hovered = false;
      this.redraw();
    });
    this.on("pointertap", () => {
      if (this.enabled) this.options.onClick();
    });

    this.setEnabled(true);
  }

  /** Enable or disable the button, updating colors, cursor and icon alpha. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.eventMode = enabled ? "static" : "none";
    this.cursor = enabled ? "pointer" : "default";
    this.icon.alpha = enabled ? 1 : ICON_DISABLED_ALPHA;
    if (!enabled) this.hovered = false;
    this.redraw();
  }

  private redraw(): void {
    const fill = this.enabled
      ? this.hovered
        ? ICON_HOVER_FILL
        : ICON_FILL
      : ICON_DISABLED_FILL;
    this.background
      .clear()
      .rect(0, 0, ICON_BUTTON_SIZE, ICON_BUTTON_SIZE)
      .fill(fill)
      .stroke({ color: 0x000000, width: 1 });
  }
}
