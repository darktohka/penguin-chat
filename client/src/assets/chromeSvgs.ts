/**
 * Every chrome SVG (title artwork, loading ring, RocketSnail logo), inlined into
 * the JS bundle at build time.
 *
 * These used to live under `public/images/` as 1x/2x/4x PNGs. Vite now bundles
 * each SVG's source as a raw string (`?raw`), so they cost zero extra HTTP
 * requests and stay crisp at any zoom level. `title.svg` is the five title
 * shapes (SWF shapes 11-15) composed exactly as the original main timeline lays
 * them out.
 */
const modules = import.meta.glob("./chrome/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/** Chrome asset name (`title`, `loading`, `rocketsnail`) to its SVG source. */
export const CHROME_SVGS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(modules).map(([path, svg]) => [
    path.slice(path.lastIndexOf("/") + 1, -".svg".length),
    svg,
  ]),
);
