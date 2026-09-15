import { Assets, Sprite, Texture, type Spritesheet } from "pixi.js";
import { ROOM_SVGS } from "../assets/roomSvgs";
import { SNOWCAT_SHAPE_SVGS } from "../assets/snowcatShapes";
import {
  ASSET_LOADING,
  ASSET_ROCKETSNAIL,
  ASSET_SHEET,
  ASSET_TITLE,
  ICON_SOURCES,
  MAX_RESOLUTION,
} from "../core/constants";

// Pixi's SVG loader expects a URL, so inlined SVG text is encoded as a `data:` URI.
function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

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

/**
 * Load every snowcat shape as a texture, keyed by its SWF shape id.
 *
 * The shape SVGs are bundled into the JS at build time (`SNOWCAT_SHAPE_SVGS`),
 * so each is loaded as an inline `data:` URI: no per-shape HTTP requests. Pixi
 * caches each under a stable alias, so reloading is free once decoded.
 */
export async function loadSnowcatShapes(): Promise<Map<number, Texture>> {
  const entries = await Promise.all(
    Object.entries(SNOWCAT_SHAPE_SVGS).map(async ([key, svg]) => {
      const id = Number(key);
      const texture = await Assets.load<Texture>({
        alias: `snowcat:${id}`,
        src: svgDataUri(svg),
      });
      return [id, texture] as const;
    }),
  );
  return new Map(entries);
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
 * Load the SVG textures used by a room's background/foreground art. The art is
 * bundled into the JS at build time (`ROOM_SVGS`), so each is loaded as an
 * inline `data:` URI with no network request; PIXI caches each under a stable
 * alias. An unknown room id falls back to the plain Snow Room (`penguin1`).
 */
export async function loadRoomAssets(roomId: string): Promise<RoomAssets> {
  switch (roomId) {
    case "northpole": {
      const northpole = await Assets.load<Texture>({
        alias: "room:northpole",
        src: svgDataUri(ROOM_SVGS.northpole),
      });
      return { roomId: "northpole", northpole };
    }
    case "crashsite": {
      const [crashedBobcat, wave, bobcatLayer2] = await Promise.all([
        Assets.load<Texture>({
          alias: "room:crashedbobcat",
          src: svgDataUri(ROOM_SVGS.crashedbobcat),
        }),
        Assets.load<Texture>({
          alias: "room:wave",
          src: svgDataUri(ROOM_SVGS.wave),
        }),
        Assets.load<Texture>({
          alias: "room:bobcatlayer2",
          src: svgDataUri(ROOM_SVGS.bobcatlayer2),
        }),
      ]);
      return { roomId: "crashsite", crashedBobcat, wave, bobcatLayer2 };
    }
    default:
      return { roomId: "penguin1" };
  }
}
