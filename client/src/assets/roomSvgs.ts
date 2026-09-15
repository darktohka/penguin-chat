/**
 * Every room-art SVG, inlined into the JS bundle at build time.
 *
 * Room art used to live under `public/assets/rooms/` and was fetched one file
 * per room at runtime. Vite now bundles each SVG's source as a raw string
 * (`?raw`), so rooms cost zero extra network requests, and the set of files is
 * discovered from the directory instead of being hard-coded here.
 */
const modules = import.meta.glob("./rooms/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/** Room SVG file stem (e.g. `northpole`) to its SVG source text. */
export const ROOM_SVGS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(modules).map(([path, svg]) => [
    path.slice(path.lastIndexOf("/") + 1, -".svg".length),
    svg,
  ]),
);
