/**
 * Every toolbar icon SVG, inlined into the JS bundle at build time.
 *
 * The icons used to live under `public/icons/` as 1x/2x/4x PNGs and were fetched
 * over the network per resolution. Vite now bundles each SVG's source as a raw
 * string (`?raw`), so an icon costs zero extra HTTP requests and scales crisply
 * at any resolution, and the set of icons is discovered from the directory
 * instead of being hard-coded here.
 */
const modules = import.meta.glob("./icons/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/** Icon name (e.g. `send`) to its SVG source text. */
export const ICON_SVGS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(modules).map(([path, svg]) => [
    path.slice(path.lastIndexOf("/") + 1, -".svg".length),
    svg,
  ]),
);
