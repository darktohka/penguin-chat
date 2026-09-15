import {
  AnimatedSprite,
  Container,
  type RenderLayer,
  type Spritesheet,
  type Texture,
} from "pixi.js";
import {
  PENGUIN_ANCHOR_Y,
  PENGUIN_ANIMATION_SPEED,
  PENGUIN_DEFAULT_DIRECTION,
} from "../core/constants";
import { walkFrames } from "../pixi/assets";
import { Character } from "./Character";

/**
 * A rendered penguin: an eight-direction animated spritesheet (`move0`..`move7`)
 * on top of the shared `Character` behaviour (balloon, name, hole transitions).
 */
export class Penguin extends Character {
  private readonly spritesheet: Spritesheet;
  private readonly sprite: AnimatedSprite;

  constructor(
    playerId: string,
    displayName: string,
    x: number,
    y: number,
    spritesheet: Spritesheet,
    overlayLayer: RenderLayer,
    isLocal = false,
  ) {
    super(playerId, displayName, x, y, overlayLayer, isLocal);
    this.spritesheet = spritesheet;

    this.sprite = new AnimatedSprite(this.frames(PENGUIN_DEFAULT_DIRECTION));
    this.sprite.anchor.set(0.5, PENGUIN_ANCHOR_Y);
    this.sprite.animationSpeed = PENGUIN_ANIMATION_SPEED;
    this.sprite.gotoAndStop(0);
    this.addChild(this.sprite);
  }

  protected override get body(): Container {
    return this.sprite;
  }

  private frames(direction: number): Texture[] {
    return walkFrames(this.spritesheet, direction, PENGUIN_DEFAULT_DIRECTION);
  }

  protected override idlePose(direction: number): void {
    this.sprite.textures = this.frames(direction);
    this.sprite.gotoAndStop(0);
  }

  protected override walkPose(direction: number): void {
    this.sprite.textures = this.frames(direction);
    this.sprite.play();
  }
}
