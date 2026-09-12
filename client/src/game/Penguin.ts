import { Container, Text, type Graphics } from "pixi.js";
import { Graphics as PixiGraphics } from "pixi.js";
import {
  AnimatedSprite,
  FillGradient,
  type Spritesheet,
  type Texture,
} from "pixi.js";
import { gsap } from "gsap";
import {
  BALLOON_FILL,
  BALLOON_FONT_SIZE,
  BALLOON_HOLD_SECONDS,
  BALLOON_LINE_HEIGHT,
  BALLOON_OFFSET_Y,
  BALLOON_WRAP_WIDTH,
  HOLE_DROP_TIMING,
  HOLE_INTRO_TIMING,
  HOLE_SPRITE_SCALE,
  HOLE_STEP_SECONDS,
  PENGUIN_ANCHOR_Y,
  PENGUIN_ANIMATION_SPEED,
  PENGUIN_DEFAULT_DIRECTION,
  PENGUIN_DIRECTIONS,
  PENGUIN_SPEED,
  RING_ASPECT,
  RING_COLOR,
  RING_HEIGHT,
  RING_STROKE,
  RING_WIDTH,
} from "../core/constants";
import { walkFrames } from "../pixi/assets";
import { backEase } from "../pixi/easing";

type Timeline = ReturnType<typeof gsap.timeline>;
type Delayed = ReturnType<typeof gsap.delayedCall>;

/** Faint ellipse under the local penguin marking it as "you". */
function createRing(): PixiGraphics {
  const width = RING_WIDTH;
  const height = width / RING_ASPECT;
  const stroke = RING_STROKE;
  const ring = new PixiGraphics();
  ring.ellipse(0, 0, (width - stroke) / 2, (height - stroke) / 2);
  ring.stroke({ color: RING_COLOR, width: stroke });
  return ring;
}

/** The speech balloon drawn above a penguin's head. */
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

/**
 * The "hole" a penguin climbs out of (intro) or drops into (leaving).
 *
 * `open` morphs between 0 (closed, invisible) and 1 (fully open ellipse), and
 * `clipTo(sprite)` masks a sprite to everything outside the opening so it
 * appears to slide through the hole.
 */
class Hole extends Container {
  private _open = 0;
  private readonly shape = new PixiGraphics();
  private readonly gradient = new PixiGraphics();
  private readonly clip = new PixiGraphics();
  private clipped: Container | null = null;

  private readonly radiusX = PENGUIN_DIRECTIONS;
  private readonly radiusY = PENGUIN_DIRECTIONS / 2;

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
 * A rendered penguin: an eight-direction animated sprite with a speech balloon
 * and hole intro/drop transitions.
 */
export class Penguin extends Container {
  public readonly playerId: string;
  public readonly displayName: string;
  private readonly spritesheet: Spritesheet;
  private readonly sprite: AnimatedSprite;
  private readonly ring: Graphics | undefined;
  private readonly balloon: Text;

  private currentDir = PENGUIN_DEFAULT_DIRECTION;
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
    spritesheet: Spritesheet,
    isLocal = false,
  ) {
    super();
    this.playerId = playerId;
    this.displayName = displayName;
    this.spritesheet = spritesheet;
    this.x = x;
    this.y = y;
    this.confirmedX = x;
    this.confirmedY = y;

    if (isLocal) {
      this.ring = createRing();
      this.addChild(this.ring);
    }

    this.sprite = new AnimatedSprite(this.frames(PENGUIN_DEFAULT_DIRECTION));
    this.sprite.anchor.set(0.5, PENGUIN_ANCHOR_Y);
    this.sprite.animationSpeed = PENGUIN_ANIMATION_SPEED;
    this.sprite.gotoAndStop(0);
    this.addChild(this.sprite);

    this.balloon = createBalloon();
    this.addChild(this.balloon);

    this.pivot.set(0, 0);
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

  private frames(direction: number): Texture[] {
    return walkFrames(this.spritesheet, direction, PENGUIN_DEFAULT_DIRECTION);
  }

  private idle(direction: number): void {
    this.sprite.textures = this.frames(direction);
    this.sprite.gotoAndStop(0);
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
    this.sprite.textures = this.frames(direction);
    this.sprite.play();

    gsap.to(this, {
      x,
      y,
      duration,
      ease: "none",
      onComplete: () => {
        this.idle(this.currentDir);
        onComplete?.();
      },
    });
  }

  /** Teleport to a position without animating (used while the tab is hidden). */
  setPosition(x: number, y: number): void {
    gsap.killTweensOf(this);
    this.idle(this.currentDir);
    this.x = x;
    this.y = y;
  }

  /** Return to the last confirmed position. */
  revert(): void {
    gsap.killTweensOf(this);
    this.x = this.confirmedX;
    this.y = this.confirmedY;
    this.idle(this.currentDir);
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

    const hole = new Hole();
    this.addChildAt(hole, 0);
    if (this.ring) this.ring.visible = false;
    this.hideBalloon();
    gsap.killTweensOf(this.sprite);
    this.sprite.textures = this.frames(
      dropping ? PENGUIN_DEFAULT_DIRECTION : 0,
    );
    this.sprite.gotoAndStop(0);
    this.sprite.visible = true;

    const holeHeight = RING_HEIGHT;
    if (!dropping) {
      this.sprite.scale.set(HOLE_SPRITE_SCALE);
      this.sprite.y = holeHeight;
      hole.clipTo(this.sprite);
    }
    this.transition?.kill();

    const timeline = gsap.timeline({
      onComplete: () => {
        this.transition = undefined;
        hole.clipTo(null);
        this.removeChild(hole);
        hole.destroy({ children: true });
        this.sprite.scale.set(1);
        this.sprite.y = 0;
        if (dropping) this.sprite.visible = false;
        else if (this.ring) this.ring.visible = true;
      },
    });

    timeline.to(hole, {
      open: 1,
      duration: seconds(timing.open),
      ease: backEase(80),
    });
    if (dropping) {
      timeline.call(() => {
        hole.clipTo(this.sprite);
      });
    }

    const transit = seconds(timing.transit);
    timeline.to(this.sprite, {
      y: dropping ? holeHeight : 0,
      duration: transit,
      ease: backEase(dropping ? -80 : 80),
    });
    timeline.to(
      this.sprite.scale,
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
      if (dropping) this.sprite.visible = false;
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
    gsap.killTweensOf(this.sprite);
    super.destroy(options);
  }
}
