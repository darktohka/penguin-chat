import { Assets, Sprite, Texture, type Spritesheet } from "pixi.js";
import {
  ASSET_LOADING,
  ASSET_ROCKETSNAIL,
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
