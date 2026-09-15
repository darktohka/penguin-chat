import { Container, FillGradient, Graphics, RenderLayer, Text } from "pixi.js";
import { gsap } from "gsap/gsap-core";
import {
  BALLOON_FILL,
  BALLOON_FONT_SIZE,
  BALLOON_HOLD_SECONDS,
  BALLOON_LINE_HEIGHT,
  BALLOON_OFFSET_Y,
  BALLOON_WRAP_WIDTH,
  EXTENDED,
  FONT_UI,
  HOLE_DROP_TIMING,
  HOLE_INTRO_TIMING,
  HOLE_SPRITE_SCALE,
  HOLE_STEP_SECONDS,
  NAME_TEXT_COLOR,
  NAME_TEXT_FONT_SIZE,
  NAME_TEXT_OFFSET_Y,
  PENGUIN_DEFAULT_DIRECTION,
  PENGUIN_DIRECTIONS,
  PENGUIN_SPEED,
  RING_ASPECT,
  RING_COLOR,
  RING_HEIGHT,
  RING_STROKE,
  RING_WIDTH,
} from "../core/constants";
import { backEase } from "../pixi/easing";

type Timeline = ReturnType<typeof gsap.timeline>;
type Delayed = ReturnType<typeof gsap.delayedCall>;

/** Faint ellipse under the local player marking it as "you". */
function createRing(): Graphics {
  const width = RING_WIDTH;
  const height = width / RING_ASPECT;
  const stroke = RING_STROKE;
  const ring = new Graphics();
  ring.ellipse(0, 0, (width - stroke) / 2, (height - stroke) / 2);
  ring.stroke({ color: RING_COLOR, width: stroke });
  return ring;
}

/** The speech balloon drawn above a character's head. */
function createBalloon(): Text {
  const balloon = new Text({
    text: "",
    style: {
      fontFamily: "Arial, sans-serif",
      fontWeight: "normal",
      fontSize: BALLOON_FONT_SIZE,
      lineHeight: BALLOON_LINE_HEIGHT,
      fill: BALLOON_FILL,
      align: "center",
      wordWrap: true,
      breakWords: true,
      wordWrapWidth: BALLOON_WRAP_WIDTH,
    },
  });
  balloon.anchor.set(0.5, 0);
  balloon.position.set(0, BALLOON_OFFSET_Y);
  balloon.visible = false;
  return balloon;
}

/** The name label drawn under a character (SWF `name` field). */
function createNameLabel(displayName: string, offsetY: number): Text {
  const label = new Text({
    text: displayName,
    style: {
      fontFamily: FONT_UI,
      fontSize: NAME_TEXT_FONT_SIZE,
      fill: NAME_TEXT_COLOR,
      align: "center",
    },
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, offsetY);
  return label;
}

/**
 * The "hole" a character climbs out of (intro) or drops into (leaving).
 *
 * `open` morphs between 0 (closed, invisible) and 1 (fully open ellipse), and
 * `clipTo(sprite)` masks a sprite to everything outside the opening so it
 * appears to slide through the hole.
 */
class Hole extends Container {
  private _open = 0;
  private readonly shape = new Graphics();
  private readonly gradient = new Graphics();
  private readonly clip = new Graphics();
  private clipped: Container | null = null;

  private readonly radiusX = RING_WIDTH / 2;
  private readonly radiusY = RING_HEIGHT / 2;

  constructor() {
    super();
    this.addChild(this.shape);

    this.gradient.ellipse(0, 0, this.radiusX, this.radiusY);
    this.gradient.fill(
      new FillGradient({
        type: "radial",
        center: { x: 0.66, y: 0.3 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.5,
        colorStops: [
          { offset: 0, color: 0xcccccc },
          { offset: 1, color: 0x666666 },
        ],
        textureSpace: "local",
      }),
    );
    this.gradient.mask = this.shape;
    this.addChild(this.gradient);

    this.addChild(this.clip);
    this.setOpen(0);
  }

  /** Edge point on the ellipse for parameter `t` in `0..48`. */
  private edge(t: number): [number, number] {
    const x = -this.radiusX + (2 * this.radiusX * t) / 48;
    const y = Math.sqrt(Math.max(0, 1 - (x / this.radiusX) ** 2));
    return [x, y];
  }

  /** Mask `target` (or clear the mask) to the area outside the opening. */
  clipTo(target: Container | null): void {
    if (this.clipped) this.clipped.mask = null;
    this.clipped = target;
    this.clip.clear();
    if (!target) return;

    const big = 320;
    const points = [-big, -big, big, -big, big, 0];
    for (let t = 48; t >= 0; t--) {
      const [x, y] = this.edge(t);
      points.push(x, this.radiusY * y);
    }
    points.push(-big, 0);
    this.clip.poly(points);
    this.clip.fill(0xffffff);
    target.mask = this.clip;
  }

  get open(): number {
    return this._open;
  }

  set open(value: number) {
    this._open = value;
    this.setOpen(value);
  }

  private setOpen(value: number): void {
    const bottom = value * RING_HEIGHT;
    const points: number[] = [];
    for (let t = 0; t <= 48; t++) {
      const [x, y] = this.edge(t);
      points.push(x, -this.radiusY * y);
    }
    for (let t = 48; t >= 0; t--) {
      const [x, y] = this.edge(t);
      points.push(x, Math.min(this.radiusY * y, bottom - this.radiusY * y));
    }
    this.shape.clear();
    this.shape.poly(points);
    this.shape.fill(0xffffff);
    this.gradient.visible = value > 0;
  }
}

/**
 * A player avatar: an eight-direction sprite with a speech balloon and hole
 * intro/drop transitions. Subclasses (`Penguin`, `Snowcat`) supply the visuals
 * by implementing `body`/`idlePose`/`walkPose`.
 */
export abstract class Character extends Container {
  public readonly playerId: string;
  public readonly displayName: string;
  protected readonly overlayLayer: RenderLayer;
  private readonly ring: Graphics | undefined;
  private readonly balloon: Text;
  private readonly nameLabel: Text | undefined;

  protected currentDir = PENGUIN_DEFAULT_DIRECTION;
  private balloonTimer: Delayed | undefined;
  private saidAt = 0;
  private transition: Timeline | undefined;
  private readonly confirmedX: number;
  private readonly confirmedY: number;

  constructor(
    playerId: string,
    displayName: string,
    x: number,
    y: number,
    overlayLayer: RenderLayer,
    isLocal = false,
  ) {
    super();
    this.playerId = playerId;
    this.displayName = displayName;
    this.overlayLayer = overlayLayer;
    this.x = x;
    this.y = y;
    this.confirmedX = x;
    this.confirmedY = y;

    if (isLocal) {
      this.ring = createRing();
      this.addChild(this.ring);
    }

    if (EXTENDED) {
      this.nameLabel = createNameLabel(displayName, this.nameOffsetY);
      this.addChild(this.nameLabel);
      this.overlayLayer.attach(this.nameLabel);
    }

    this.balloon = createBalloon();
    this.addChild(this.balloon);
    this.overlayLayer.attach(this.balloon);

    this.pivot.set(0, 0);
  }

  /** The visual the hole transition scales and clips. */
  protected abstract get body(): Container;

  /** Show `direction`'s standing pose. */
  protected abstract idlePose(direction: number): void;

  /** Show `direction`'s walking pose and start animating it. */
  protected abstract walkPose(direction: number): void;

  /** Y offset of the name label below the character origin. */
  protected get nameOffsetY(): number {
    return NAME_TEXT_OFFSET_Y;
  }

  /** Show `message` in the speech balloon. */
  say(message: string): void {
    this.balloon.text = message;
    this.balloon.visible = true;
    this.saidAt = Date.now();
    this.holdBalloon(BALLOON_HOLD_SECONDS);
  }

  private holdBalloon(seconds: number): void {
    this.balloonTimer?.kill();
    this.balloonTimer = gsap.delayedCall(seconds, () => this.hideBalloon());
  }

  /** Snap any in-flight transition/tween to completion (e.g. after tab return). */
  resync(): void {
    this.transition?.progress(1, false);
    for (const tween of gsap.getTweensOf(this)) tween.progress(1, false);
    this.resyncBalloon();
  }

  private resyncBalloon(): void {
    if (!this.balloon.visible) return;
    const elapsed = (Date.now() - this.saidAt) / 1000;
    if (elapsed >= BALLOON_HOLD_SECONDS) this.hideBalloon();
    else this.holdBalloon(BALLOON_HOLD_SECONDS - elapsed);
  }

  private hideBalloon(): void {
    this.balloonTimer?.kill();
    this.balloonTimer = undefined;
    this.balloon.visible = false;
  }

  /** Convert a movement delta into one of the eight walk directions. */
  private calcDirection(dx: number, dy: number): number {
    const angle =
      (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return (
      Math.round(angle / ((Math.PI * 2) / PENGUIN_DIRECTIONS)) %
      PENGUIN_DIRECTIONS
    );
  }

  /** Walk to a world position at `PENGUIN_SPEED` units/second. */
  moveTo(x: number, y: number, onComplete?: () => void): void {
    const dx = x - this.x;
    const dy = y - this.y;
    const duration = Math.sqrt(dx * dx + dy * dy) / PENGUIN_SPEED;
    gsap.killTweensOf(this);

    const direction = this.calcDirection(dx, dy);
    this.currentDir = direction;
    this.walkPose(direction);

    gsap.to(this, {
      x,
      y,
      duration,
      ease: "none",
      onComplete: () => {
        this.idlePose(this.currentDir);
        onComplete?.();
      },
    });
  }

  /** Teleport to a position without animating (used while the tab is hidden). */
  setPosition(x: number, y: number): void {
    gsap.killTweensOf(this);
    this.idlePose(this.currentDir);
    this.x = x;
    this.y = y;
  }

  /** Return to the last confirmed position. */
  revert(): void {
    gsap.killTweensOf(this);
    this.x = this.confirmedX;
    this.y = this.confirmedY;
    this.idlePose(this.currentDir);
  }

  /** Climb out of a hole. */
  playIntro(): Timeline {
    return this.holeTransition(false);
  }

  /** Drop into a hole. */
  playDrop(): Timeline {
    return this.holeTransition(true);
  }

  private holeTransition(dropping: boolean): Timeline {
    const timing = dropping ? HOLE_DROP_TIMING : HOLE_INTRO_TIMING;
    const seconds = (steps: number): number => steps * HOLE_STEP_SECONDS;
    const body = this.body;

    const hole = new Hole();
    this.addChildAt(hole, 0);
    if (this.ring) this.ring.visible = false;
    if (this.nameLabel) this.nameLabel.visible = false;
    this.hideBalloon();
    gsap.killTweensOf(body);
    this.idlePose(dropping ? PENGUIN_DEFAULT_DIRECTION : 0);
    body.visible = true;

    const holeHeight = RING_HEIGHT;
    if (!dropping) {
      body.scale.set(HOLE_SPRITE_SCALE);
      body.y = holeHeight;
      hole.clipTo(body);
    }
    this.transition?.kill();

    const timeline = gsap.timeline({
      onComplete: () => {
        this.transition = undefined;
        hole.clipTo(null);
        this.removeChild(hole);
        hole.destroy({ children: true });
        body.scale.set(1);
        body.y = 0;
        if (dropping) body.visible = false;
        else if (this.ring) this.ring.visible = true;
        if (this.nameLabel) this.nameLabel.visible = !dropping;
      },
    });

    timeline.to(hole, {
      open: 1,
      duration: seconds(timing.open),
      ease: backEase(80),
    });
    if (dropping) {
      timeline.call(() => {
        hole.clipTo(body);
      });
    }

    const transit = seconds(timing.transit);
    timeline.to(body, {
      y: dropping ? holeHeight : 0,
      duration: transit,
      ease: backEase(dropping ? -80 : 80),
    });
    timeline.to(
      body.scale,
      {
        x: dropping ? HOLE_SPRITE_SCALE : 1,
        y: dropping ? HOLE_SPRITE_SCALE : 1,
        duration: transit,
        ease: backEase(dropping ? -80 : 80),
      },
      "<",
    );
    timeline.call(() => {
      hole.clipTo(null);
      if (dropping) body.visible = false;
    });
    timeline.to(hole, {
      open: 0,
      duration: seconds(timing.close),
      ease: backEase(-80),
    });

    this.transition = timeline;
    return timeline;
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.balloonTimer?.kill();
    this.balloonTimer = undefined;
    this.transition?.kill();
    this.transition = undefined;
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.body);
    this.overlayLayer.detach(this.balloon);
    if (this.nameLabel) this.overlayLayer.detach(this.nameLabel);
    super.destroy(options);
  }
}
