import type { CritterDescriptor } from "../core/types";

/** Constructor input for a `Player`. */
export interface PlayerInit {
  id: string;
  username?: string;
  nickname?: string;
  x?: number;
  y?: number;
  critter?: CritterDescriptor;
}

/**
 * Lightweight client-side player model. It tracks the last confirmed position
 * and the latest server target, so the view (`Penguin`) can animate toward it.
 */
export class Player {
  public readonly id: string;
  public username: string;
  public nickname: string;
  public x: number;
  public y: number;
  public targetX: number;
  public targetY: number;
  public critter: CritterDescriptor | undefined;

  constructor(init: PlayerInit) {
    this.id = init.id;
    this.username = init.username ?? this.id;
    this.nickname = init.nickname ?? this.username;
    this.x = init.x ?? 0;
    this.y = init.y ?? 0;
    this.targetX = init.x ?? 0;
    this.targetY = init.y ?? 0;
    this.critter = init.critter;
  }

  setTarget(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }
}
