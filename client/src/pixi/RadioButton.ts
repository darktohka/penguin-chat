import { Container, Graphics, Rectangle, Text } from "pixi.js";
import {
  FONT_UI,
  RADIO_FILL,
  RADIO_LABEL_COLOR,
  RADIO_LABEL_FONT_SIZE,
  RADIO_LABEL_GAP,
  RADIO_RADIUS,
  RADIO_SELECTED_FILL,
  RADIO_STROKE,
  RADIO_STROKE_WIDTH,
} from "../core/constants";

/** Options for a single `RadioButton` option. */
export interface RadioButtonOptions {
  label: string;
  selected?: boolean;
  onChange: () => void;
}

/**
 * One option of a radio group, matching the SWF's room selector: a small
 * circle (white when idle, gold when selected) with its label to the right.
 */
export class RadioButton extends Container {
  private selected: boolean;
  private readonly circle = new Graphics();
  private readonly labelText: Text;

  constructor(private readonly options: RadioButtonOptions) {
    super();
    this.selected = options.selected ?? false;

    this.labelText = new Text({
      text: options.label,
      style: {
        fontFamily: FONT_UI,
        fontSize: RADIO_LABEL_FONT_SIZE,
        fill: RADIO_LABEL_COLOR,
      },
    });
    this.labelText.anchor.set(0, 0.5);
    this.labelText.position.set(RADIO_RADIUS + RADIO_LABEL_GAP, 0);

    this.addChild(this.circle, this.labelText);

    this.eventMode = "static";
    this.cursor = "pointer";
    // Cover the whole row, so the gap between the circle and its label is also
    // clickable rather than only the two drawn children.
    const left = -(RADIO_RADIUS + RADIO_STROKE_WIDTH);
    const right = RADIO_RADIUS + RADIO_LABEL_GAP + this.labelText.width;
    const halfHeight =
      Math.max(RADIO_RADIUS, this.labelText.height / 2) + RADIO_STROKE_WIDTH;
    this.hitArea = new Rectangle(left, -halfHeight, right - left, halfHeight * 2);
    this.on("pointertap", () => this.options.onChange());

    this.redraw();
  }

  /** Set the selected state and repaint the circle. */
  setSelected(selected: boolean): void {
    if (this.selected === selected) return;
    this.selected = selected;
    this.redraw();
  }

  get isSelected(): boolean {
    return this.selected;
  }

  private redraw(): void {
    this.circle
      .clear()
      .circle(0, 0, RADIO_RADIUS)
      .fill(this.selected ? RADIO_SELECTED_FILL : RADIO_FILL)
      .stroke({ color: RADIO_STROKE, width: RADIO_STROKE_WIDTH });
  }
}
