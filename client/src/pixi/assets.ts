import {
  Assets,
  Graphics,
  GraphicsContext,
  type Spritesheet,
  type Texture,
} from "pixi.js";
import { CHROME_SVGS } from "../assets/chromeSvgs";
import { ICON_SVGS } from "../assets/iconSvgs";
import { ROOM_SVGS } from "../assets/roomSvgs";
import { SNOWCAT_SHAPE_SVGS } from "../assets/snowcatShapes";
import { ASSET_SHEET, MAX_RESOLUTION } from "../core/constants";
import { normalizeSvg } from "./svg";

/** A vector SVG asset: its shared geometry plus its declared SVG viewport size. */
export interface SvgAsset {
  readonly context: GraphicsContext;
  readonly width: number;
  readonly height: number;
}

// Pixi's SVG loader expects a URL, so inlined SVG text is encoded as a `data:` URI.
function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Normalize an SWF-exported SVG and load it as a shared vector context. */
async function loadSvgAsset(alias: string, raw: string): Promise<SvgAsset> {
  const normalized = normalizeSvg(raw);
  const context = await Assets.load<GraphicsContext>({
    alias,
    src: svgDataUri(normalized.svg),
    data: { parseAsGraphicsContext: true },
  });
  return { context, width: normalized.width, height: normalized.height };
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

/** Recorded vector icon assets, keyed by icon name. Populated by `loadIcons`. */
const iconAssets = new Map<string, SvgAsset>();

/** Load the four toolbar icons as vector contexts under `icon:<name>` aliases. */
export async function loadIcons(): Promise<void> {
  await Promise.all(
    Object.entries(ICON_SVGS).map(async ([name, svg]) => {
      const asset = await loadSvgAsset(`icon:${name}`, svg);
      iconAssets.set(name, asset);
    }),
  );
}

/** Get a loaded icon asset as a fresh vector `Graphics`, centered on its origin. */
export function iconSprite(name: string): Graphics {
  const asset = iconAssets.get(name);
  if (!asset) throw new Error(`Icon "${name}" not loaded`);
  const graphics = new Graphics(asset.context);
  graphics.pivot.set(asset.width / 2, asset.height / 2);
  return graphics;
}

/**
 * Load a chrome asset (`title`, `loading` or `rocketsnail`) from its bundled
 * SVG. PIXI caches each under a stable alias, so reloading is free.
 */
export function loadChromeTexture(name: string): Promise<SvgAsset> {
  return loadSvgAsset(`chrome:${name}`, CHROME_SVGS[name]);
}

/** Load the title / loading / RocketSnail assets used by the chrome. */
export async function loadChrome(): Promise<{
  title: SvgAsset;
  loading: SvgAsset;
  rocketsnail: SvgAsset;
}> {
  const [title, loading, rocketsnail] = await Promise.all([
    loadChromeTexture("title"),
    loadChromeTexture("loading"),
    loadChromeTexture("rocketsnail"),
  ]);
  return { title, loading, rocketsnail };
}

/**
 * Load every snowcat shape as a vector context, keyed by its SWF shape id.
 *
 * The shape SVGs are bundled into the JS at build time (`SNOWCAT_SHAPE_SVGS`),
 * so each is loaded as an inline `data:` URI: no per-shape HTTP requests. Pixi
 * caches each under a stable alias, so reloading is free once decoded.
 */
export async function loadSnowcatShapes(): Promise<Map<number, SvgAsset>> {
  const entries = await Promise.all(
    Object.entries(SNOWCAT_SHAPE_SVGS).map(async ([key, svg]) => {
      const id = Number(key);
      const asset = await loadSvgAsset(`snowcat:${id}`, svg);
      return [id, asset] as const;
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

/** Vector assets needed to render a room's art, discriminated by resolved id. */
export type RoomAssets =
  | { readonly roomId: "penguin1" }
  | { readonly roomId: "northpole"; readonly northpole: SvgAsset }
  | {
      readonly roomId: "crashsite";
      readonly crashedBobcat: SvgAsset;
      readonly wave: SvgAsset;
      readonly bobcatLayer2: SvgAsset;
    };

/**
 * Load the SVG assets used by a room's background/foreground art. The art is
 * bundled into the JS at build time (`ROOM_SVGS`), so each is loaded as an
 * inline `data:` URI with no network request; PIXI caches each under a stable
 * alias. An unknown room id falls back to the plain Snow Room (`penguin1`).
 */
export async function loadRoomAssets(roomId: string): Promise<RoomAssets> {
  switch (roomId) {
    case "northpole": {
      const northpole = await loadSvgAsset(
        "room:northpole",
        ROOM_SVGS.northpole,
      );
      return { roomId: "northpole", northpole };
    }
    case "crashsite": {
      const [crashedBobcat, wave, bobcatLayer2] = await Promise.all([
        loadSvgAsset("room:crashedbobcat", ROOM_SVGS.crashedbobcat),
        loadSvgAsset("room:wave", ROOM_SVGS.wave),
        loadSvgAsset("room:bobcatlayer2", ROOM_SVGS.bobcatlayer2),
      ]);
      return { roomId: "crashsite", crashedBobcat, wave, bobcatLayer2 };
    }
    default:
      return { roomId: "penguin1" };
  }
}
