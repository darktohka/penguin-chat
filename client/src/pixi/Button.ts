import { Container, Graphics, Text } from "pixi.js";
import {
  BUTTON_DISABLED_FILL,
  BUTTON_DISABLED_TEXT,
  BUTTON_FILL,
  BUTTON_HOVER_FILL,
  BUTTON_TEXT_COLOR,
  FONT_NARROW,
} from "../core/constants";

/** Options for a text `Button`. */
export interface ButtonOptions {
  label: string;
  width: number;
  height: number;
  fill?: number;
  hoverFill?: number;
  textColor?: number;
  fontSize?: number;
  enabled?: boolean;
  onClick: () => void;
}

/**
 * A rectangular text button with hover and disabled states, centered on its pivot.
 */
export class Button extends Container {
  private readonly background = new Graphics();
  private readonly labelText: Text;
  private enabled: boolean;
  private hovered = false;
  private readonly fill: number;
  private readonly hoverFill: number;
  private readonly textColor: number;

  constructor(private readonly options: ButtonOptions) {
    super();
    const { width, height, label } = options;
    const fill = options.fill ?? BUTTON_FILL;
    const hoverFill = options.hoverFill ?? BUTTON_HOVER_FILL;
    const textColor = options.textColor ?? BUTTON_TEXT_COLOR;
    this.fill = fill;
    this.hoverFill = hoverFill;
    this.textColor = textColor;

    this.pivot.set(width / 2, height / 2);
    this.enabled = options.enabled ?? true;

    this.labelText = new Text({
      text: label,
      style: {
        fontFamily: FONT_NARROW,
        fontWeight: "bold",
        fontSize: options.fontSize ?? 18,
        fill: textColor,
        align: "center",
      },
    });
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(width / 2, height / 2);

    this.addChild(this.background, this.labelText);
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

    this.setEnabled(this.enabled);
  }

  /** Enable or disable the button, updating colors and cursor. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.eventMode = enabled ? "static" : "none";
    this.cursor = enabled ? "pointer" : "default";
    this.labelText.style.fill = enabled ? this.textColor : BUTTON_DISABLED_TEXT;
    if (!enabled) this.hovered = false;
    this.redraw();
  }

  private redraw(): void {
    const fill = this.enabled
      ? this.hovered
        ? this.hoverFill
        : this.fill
      : BUTTON_DISABLED_FILL;
    const { width, height } = this.options;
    this.background
      .clear()
      .rect(0, 0, width, height)
      .fill(fill)
      .stroke({ color: 0x000000, width: 1 });
  }
}
