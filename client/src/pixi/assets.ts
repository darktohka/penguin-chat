import { Assets, Sprite, Texture, type Spritesheet } from "pixi.js";
import {
  ASSET_LOADING,
  ASSET_ROCKETSNAIL,
  ASSET_ROOM_BOBCAT_LAYER2,
  ASSET_ROOM_CRASHED_BOBCAT,
  ASSET_ROOM_NORTHPOLE,
  ASSET_ROOM_WAVE,
  ASSET_SHEET,
  ASSET_TITLE,
  ICON_SOURCES,
  MAX_RESOLUTION,
} from "../core/constants";

/** Initialize the Pixi asset system with the client's resolution preference. */
export async function initAssets(): Promise<void> {
  await Assets.init({
    texturePreference: {
      resolution: Math.min(MAX_RESOLUTION, window.devicePixelRatio),
    },
  });
}

/** Load the penguin spritesheet (frames + `move0`..`move7` animations). */
export function loadSpritesheet(): Promise<Spritesheet> {
  return Assets.load<Spritesheet>(ASSET_SHEET);
}

/** Load the four toolbar icons under `icon:<name>` aliases. */
export function loadIcons(): Promise<Array<Texture | Sprite>> {
  return Promise.all(
    Object.keys(ICON_SOURCES).map((name) =>
      Assets.load<Texture>({
        alias: `icon:${name}`,
        src: [...ICON_SOURCES[name]],
      }),
    ),
  );
}

/** Get a loaded icon texture as a fresh sprite. */
export function iconSprite(name: string): Sprite {
  const sprite = new Sprite(Assets.get<Texture>(`icon:${name}`));
  sprite.anchor.set(0.5);
  return sprite;
}

/** Load the multi-resolution title / loading / RocketSnail textures. */
export async function loadChrome(): Promise<{
  title: Texture;
  loading: Texture;
  rocketsnail: Texture;
}> {
  const [title, loading, rocketsnail] = await Promise.all([
    Assets.load<Texture>({ alias: "title", src: [...ASSET_TITLE] }),
    Assets.load<Texture>({ alias: "loading", src: [...ASSET_LOADING] }),
    Assets.load<Texture>({ alias: "rocketsnail", src: [...ASSET_ROCKETSNAIL] }),
  ]);
  return { title, loading, rocketsnail };
}

/** A `Texture[]` for a walk direction, falling back to the default direction. */
export function walkFrames(
  sheet: Spritesheet,
  direction: number,
  fallback: number,
): Texture[] {
  return (
    sheet.animations[`move${direction}`] ?? sheet.animations[`move${fallback}`]
  );
}

/** Textures needed to render a room's art, discriminated by resolved id. */
export type RoomAssets =
  | { readonly roomId: "penguin1" }
  | { readonly roomId: "northpole"; readonly northpole: Texture }
  | {
      readonly roomId: "crashsite";
      readonly crashedBobcat: Texture;
      readonly wave: Texture;
      readonly bobcatLayer2: Texture;
    };

/**
 * Load the SVG textures used by a room's background/foreground art. PIXI caches
 * each texture under a stable alias, so revisiting a room does not refetch it;
 * an unknown room id falls back to the plain Snow Room (`penguin1`).
 */
export async function loadRoomAssets(roomId: string): Promise<RoomAssets> {
  switch (roomId) {
    case "northpole": {
      const northpole = await Assets.load<Texture>({
        alias: "room:northpole",
        src: ASSET_ROOM_NORTHPOLE,
      });
      return { roomId: "northpole", northpole };
    }
    case "crashsite": {
      const [crashedBobcat, wave, bobcatLayer2] = await Promise.all([
        Assets.load<Texture>({
          alias: "room:crashedbobcat",
          src: ASSET_ROOM_CRASHED_BOBCAT,
        }),
        Assets.load<Texture>({ alias: "room:wave", src: ASSET_ROOM_WAVE }),
        Assets.load<Texture>({
          alias: "room:bobcatlayer2",
          src: ASSET_ROOM_BOBCAT_LAYER2,
        }),
      ]);
      return { roomId: "crashsite", crashedBobcat, wave, bobcatLayer2 };
    }
    default:
      return { roomId: "penguin1" };
  }
}
