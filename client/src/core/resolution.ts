import { RES_ZOOM_LEVELS } from "./constants";

/**
 * App-wide canvas zoom cycled by the toolbar's "res" button. It lives here
 * rather than on a `World` so the chosen level survives room switches and
 * reconnects: a freshly created `World` re-applies it instead of dropping back
 * to 100%.
 */
let zoomIndex = 0;

/**
 * The renderer's unscaled resolution, captured on first use. Re-applying the
 * zoom on a new `World` must always scale this value, never the already scaled
 * one, or the resolution would compound on every room change.
 */
let unscaledResolution: number | undefined;

/** Zoom factor currently selected with the "res" button. */
export function zoomScale(): number {
  return RES_ZOOM_LEVELS[zoomIndex];
}

/** Advance to the next zoom level, wrapping back around to 100%. */
export function advanceZoom(): void {
  zoomIndex = (zoomIndex + 1) % RES_ZOOM_LEVELS.length;
}

/** Remember and return the renderer's unscaled resolution (the first call wins). */
export function registerBaseResolution(resolution: number): number {
  return (unscaledResolution ??= resolution);
}
