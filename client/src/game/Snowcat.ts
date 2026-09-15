import { Container, Graphics, type RenderLayer } from "pixi.js";
import { gsap } from "gsap/gsap-core";
import {
  PENGUIN_DEFAULT_DIRECTION,
  SNOWCAT_NAME_TEXT_OFFSET_Y,
  SNOWCAT_ORIGIN_OFFSET,
  SNOWCAT_POSES,
  SNOWCAT_SCALE,
  SNOWCAT_SHAPES,
  SNOWCAT_WALK_STEP_SECONDS,
  type SnowcatShapeName,
} from "../core/constants";
import type { SvgAsset } from "../pixi/assets";
import { Character } from "./Character";

type Delayed = ReturnType<typeof gsap.delayedCall>;

/**
 * A snowcat, assembled from the SWF's own shape SVGs rather than a bitmap. Each
 * of the eight directions is a static `upper` shape over an underside that
 * alternates between two poses while walking (the "sprites" clip of
 * `DefineSprite_138`); directions 6-8 reuse 4-2 mirrored.
 */
export class Snowcat extends Character {
  private readonly shapes: ReadonlyMap<string, SvgAsset>;
  private readonly composite = new Container();
  private readonly art = new Container();
  private readonly lower = new Graphics();
  private readonly upper = new Graphics();

  private lowerNames: readonly [SnowcatShapeName, SnowcatShapeName] =
    SNOWCAT_POSES[PENGUIN_DEFAULT_DIRECTION].lower;
  private lowerPose = 0;
  private walkTimer: Delayed | undefined;

  constructor(
    playerId: string,
    displayName: string,
    x: number,
    y: number,
    shapes: ReadonlyMap<string, SvgAsset>,
    overlayLayer: RenderLayer,
    isLocal = false,
  ) {
    super(playerId, displayName, x, y, overlayLayer, isLocal);
    this.shapes = shapes;

    this.art.addChild(this.lower, this.upper);
    this.art.position.set(SNOWCAT_ORIGIN_OFFSET.x, SNOWCAT_ORIGIN_OFFSET.y);
    this.composite.addChild(this.art);
    this.addChild(this.composite);
    this.idlePose(PENGUIN_DEFAULT_DIRECTION);
  }

  protected override get body(): Container {
    return this.composite;
  }

  protected override get nameOffsetY(): number {
    return SNOWCAT_NAME_TEXT_OFFSET_Y;
  }

  protected override idlePose(direction: number): void {
    this.stopWalking();
    this.applyDirection(direction);
  }

  protected override walkPose(direction: number): void {
    this.stopWalking();
    this.applyDirection(direction);
    this.scheduleStep();
  }

  private scheduleStep(): void {
    this.walkTimer = gsap.delayedCall(SNOWCAT_WALK_STEP_SECONDS, () => {
      this.lowerPose = this.lowerPose === 0 ? 1 : 0;
      this.applyLowerPose();
      this.scheduleStep();
    });
  }

  private stopWalking(): void {
    this.walkTimer?.kill();
    this.walkTimer = undefined;
  }

  /** Lay out one direction: mirror if needed, then place the static upper. */
  private applyDirection(direction: number): void {
    const pose = SNOWCAT_POSES[direction] ?? SNOWCAT_POSES[PENGUIN_DEFAULT_DIRECTION];
    this.lowerNames = pose.lower;
    this.lowerPose = 0;
    this.applyLowerPose();

    this.place(this.upper, pose.upper);

    this.art.scale.set(
      pose.mirror ? -SNOWCAT_SCALE : SNOWCAT_SCALE,
      SNOWCAT_SCALE,
    );
  }

  private applyLowerPose(): void {
    this.place(this.lower, this.lowerNames[this.lowerPose]);
  }

  /** Point `graphics` at `name`, pivoted so the shape's SWF origin sits at (0,0). */
  private place(graphics: Graphics, name: SnowcatShapeName): void {
    const asset = this.shapes.get(name);
    const shape = SNOWCAT_SHAPES[name];
    if (!asset || !shape) throw new Error(`Missing snowcat shape ${name}`);
    graphics.context = asset.context;
    graphics.pivot.set(shape.origin[0], shape.origin[1]);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.stopWalking();
    super.destroy(options);
  }
}
