/**
 * Every snowcat shape SVG, inlined into the JS bundle at build time.
 *
 * The shapes used to live under `public/assets/snowcat/` and were fetched one
 * per shape at runtime. Vite now bundles each SVG's source as a raw string
 * (`?raw`), so a snowcat costs zero extra network requests, and the set of
 * shapes is discovered from the directory instead of being hard-coded here.
 */
const modules = import.meta.glob("./snowcat/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/**
 * Shape name (`direction`-`top`/`bottom-N`, e.g. `north-top`) to its SVG source
 * text. The filename encodes which part of the snowcat it is: each direction has
 * a static `top` (body) and two alternating `bottom` (underside) walk poses.
 */
export const SNOWCAT_SHAPE_SVGS: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(modules).map(([path, svg]) => [
      path.slice(path.lastIndexOf("/") + 1, -".svg".length),
      svg,
    ]),
  );
