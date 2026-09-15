/**
 * Browser-side SVG normalization for PixiJS' vector importer.
 *
 * Pixi's built-in SVG parser (`scene/graphics/shared/svg/SVGParser.js`) has
 * three limitations that corrupt the SWF-exported art this client ships, so we
 * rewrite each SVG into an equivalent, pre-baked form instead:
 *
 * 1. It never reads the `transform` attribute of `<g>`/`<svg>`. Most of our
 *    files wrap all geometry in a `<g transform="matrix(1,0,0,1,tx,ty)">`, so
 *    those offsets are silently dropped. We bake ancestor transforms into the
 *    path coordinates.
 * 2. It never reads `gradientTransform` (and ignores `viewBox`). Our gradients
 *    use a tiny `gradientTransform` scale (their raw coordinates are ~+-819),
 *    so we fold both the element CTM and `gradientTransform` into the gradient
 *    coordinates and resolve the viewBox into the geometry.
 * 3. It cannot reproduce a general `fill-rule="evenodd"`. With the attribute
 *    absent Pixi builds `new GraphicsPath(d, true)` (its hole check), which
 *    keeps disjoint subpaths but fills a NESTED hole solid; `nonzero` fills
 *    every subpath solid; and `fill-rule="evenodd"` fills the largest subpath
 *    and `cut()`s the rest, which reproduces nested holes but erases disjoint
 *    regions. We therefore decompose each even-odd path whose subpaths form a
 *    nesting forest: an even-depth subpath plus its direct children become one
 *    `fill-rule="evenodd"` path (Pixi fills the parent and cuts the holes),
 *    while disjoint subpaths and deeper even levels become separate paths.
 *    Single-subpath and non-evenodd paths keep `fill-rule` stripped.
 *
 *    Two Pixi quirks make that grouping fragile once a parent has more than one
 *    hole. Pixi only takes its "fill the largest subpath and `cut()` the rest"
 *    branch unconditionally when a path has more than three subpaths; with
 *    exactly three it consults an area-ratio heuristic that can mistake a
 *    parent plus two sibling holes for a nested chain and fill the second
 *    hole. We therefore pad such a group with a zero-area contour. That branch
 *    also makes every `cut()` after the first attach to the instruction before
 *    the path, punching spurious holes in the preceding shape, so a group with
 *    two or more holes is preceded by an invisible viewport-sized barrier that
 *    absorbs the spill.
 *
 * The module is dependency-free and side-effect-free: it only uses the
 * browser's `DOMParser`. It produces the normalized SVG source plus the
 * declared intrinsic viewport size.
 *
 * ## Fail-fast contract
 *
 * `validateSupportedSubset` runs right after the root `<svg>` check and walks
 * every element, rejecting anything outside the small subset this module can
 * faithfully rewrite, instead of letting Pixi silently drop or mangle it:
 *
 * - Elements other than `<svg>`, `<g>`, `<path>`, `<defs>`,
 *   `<linearGradient>`, `<radialGradient>` and `<stop>`.
 * - Attributes Pixi would drop: `clip-path`, `mask`, `filter`, `marker-*`,
 *   `paint-order`, `vector-effect`, `display`, `visibility`, `style`, ... A
 *   `style` attribute is rejected on EVERY element because it is never emitted.
 * - `<stop>` attributes other than `offset` and `stop-color` (`stop-opacity`
 *   is ignored by Pixi, so it would be silently lost).
 * - Gradient `href`/`xlink:href` and any `spreadMethod` other than `pad`.
 * - `fill-rule` values other than `evenodd` (stripping a real `nonzero` would
 *   change rendering).
 * - A `viewBox` on a non-root `<svg>` (only the root viewBox is applied).
 */

export interface NormalizedSvg {
  /** SVG source safe for Pixi's built-in vector parser. */
  readonly svg: string;
  /** Declared intrinsic width in CSS px (the SVG viewport). */
  readonly width: number;
  /** Declared intrinsic height in CSS px (the SVG viewport). */
  readonly height: number;
}

// ---------------------------------------------------------------------------
// 2D affine algebra
// ---------------------------------------------------------------------------

/** A 2D affine map: `(x, y) -> (a*x + c*y + e, b*x + d*y + f)`. */
interface Affine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const EPSILON = 1e-12;

/** Keep at least three decimal places of coordinate precision. */
const COORDINATE_PRECISION = 3;

/** Compose two affine maps: the result applies `local` first, then `parent`. */
function multiply(parent: Affine, local: Affine): Affine {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    e: parent.a * local.e + parent.c * local.f + parent.e,
    f: parent.b * local.e + parent.d * local.f + parent.f,
  };
}

function apply(matrix: Affine, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/** Determinant of the linear part; `0` means the map is singular. */
function determinant(matrix: Affine): number {
  return matrix.a * matrix.d - matrix.b * matrix.c;
}

/** Uniform scale factor of a transform, used to scale strokes/radii. */
function scaleFactor(matrix: Affine): number {
  return Math.sqrt(Math.abs(determinant(matrix)));
}

// ---------------------------------------------------------------------------
// Number / token scanning
// ---------------------------------------------------------------------------

function isWhitespace(character: string): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  );
}

function isDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}

interface NumberScan {
  readonly value: number;
  /** Index immediately after the number (and any leading separators). */
  readonly end: number;
}

/**
 * Read one SVG number starting at `start`, skipping leading whitespace and
 * commas. Handles signs, decimals without a leading digit (`.5`), and
 * exponents (`8.0E-4`). Returns `undefined` when no number is present.
 */
function scanNumber(text: string, start: number): NumberScan | undefined {
  let index = start;
  while (
    index < text.length &&
    (isWhitespace(text[index]) || text[index] === ",")
  ) {
    index += 1;
  }
  const begin = index;
  if (text[index] === "+" || text[index] === "-") {
    index += 1;
  }
  let sawDigit = false;
  while (index < text.length && isDigit(text[index])) {
    index += 1;
    sawDigit = true;
  }
  if (text[index] === ".") {
    index += 1;
    while (index < text.length && isDigit(text[index])) {
      index += 1;
      sawDigit = true;
    }
  }
  if (!sawDigit) {
    return undefined;
  }
  if (text[index] === "e" || text[index] === "E") {
    let exponentEnd = index + 1;
    if (text[exponentEnd] === "+" || text[exponentEnd] === "-") {
      exponentEnd += 1;
    }
    let sawExponentDigit = false;
    while (exponentEnd < text.length && isDigit(text[exponentEnd])) {
      exponentEnd += 1;
      sawExponentDigit = true;
    }
    if (sawExponentDigit) {
      index = exponentEnd;
    }
  }
  return { value: Number(text.slice(begin, index)), end: index };
}

/** Read a whitespace/comma separated list of numbers (transform arguments). */
function scanNumbers(text: string): number[] {
  const values: number[] = [];
  let index = 0;
  while (index < text.length) {
    const scanned = scanNumber(text, index);
    if (scanned === undefined) {
      if (isWhitespace(text[index]) || text[index] === ",") {
        index += 1;
        continue;
      }
      throw new Error(`Unexpected character "${text[index]}" in argument list`);
    }
    values.push(scanned.value);
    index = scanned.end;
  }
  return values;
}

/**
 * Format a coordinate without scientific notation, rounding to
 * `COORDINATE_PRECISION` decimals and trimming trailing zeros. Pixi's path
 * parser cannot read exponents, and `toFixed` never emits them.
 */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite value produced while normalizing SVG: ${value}`);
  }
  if (Math.abs(value) < 0.5 * 10 ** -COORDINATE_PRECISION) {
    return "0";
  }
  let text = value.toFixed(COORDINATE_PRECISION);
  if (text.includes(".")) {
    text = text.replace(/0+$/, "");
    text = text.replace(/\.$/, "");
  }
  return text;
}

// ---------------------------------------------------------------------------
// transform attribute parsing
// ---------------------------------------------------------------------------

const TRANSFORM_PATTERN = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

function translation(tx: number, ty: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

/** Build the affine for a single transform function from its parsed arguments. */
function createTransform(name: string, args: readonly number[]): Affine {
  switch (name) {
    case "matrix": {
      if (args.length !== 6) {
        throw new Error(`transform matrix() expects 6 arguments, got ${args.length}`);
      }
      return { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
    }
    case "translate": {
      if (args.length < 1 || args.length > 2) {
        throw new Error(`transform translate() expects 1 or 2 arguments, got ${args.length}`);
      }
      return translation(args[0], args.length > 1 ? args[1] : 0);
    }
    case "scale": {
      if (args.length < 1 || args.length > 2) {
        throw new Error(`transform scale() expects 1 or 2 arguments, got ${args.length}`);
      }
      const sx = args[0];
      const sy = args.length > 1 ? args[1] : sx;
      return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
    }
    case "rotate": {
      if (args.length !== 1 && args.length !== 3) {
        throw new Error(`transform rotate() expects 1 or 3 arguments, got ${args.length}`);
      }
      const radians = (args[0] * Math.PI) / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const rotation: Affine = { a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 };
      if (args.length === 1) {
        return rotation;
      }
      const cx = args[1];
      const cy = args[2];
      return multiply(multiply(translation(cx, cy), rotation), translation(-cx, -cy));
    }
    case "skewx": {
      if (args.length !== 1) {
        throw new Error(`transform skewX() expects 1 argument, got ${args.length}`);
      }
      return { a: 1, b: 0, c: Math.tan((args[0] * Math.PI) / 180), d: 1, e: 0, f: 0 };
    }
    case "skewy": {
      if (args.length !== 1) {
        throw new Error(`transform skewY() expects 1 argument, got ${args.length}`);
      }
      return { a: 1, b: Math.tan((args[0] * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
    }
    default:
      throw new Error(`Unsupported transform function "${name}"`);
  }
}

/** Parse an SVG `transform` attribute into a single affine map. */
function parseTransform(text: string): Affine {
  let result = IDENTITY;
  let matched = false;
  TRANSFORM_PATTERN.lastIndex = 0;
  let match = TRANSFORM_PATTERN.exec(text);
  while (match !== null) {
    matched = true;
    result = multiply(
      result,
      createTransform(match[1].toLowerCase(), scanNumbers(match[2])),
    );
    match = TRANSFORM_PATTERN.exec(text);
  }
  if (!matched) {
    throw new Error(`Unsupported transform attribute: "${text}"`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// path data baking
// ---------------------------------------------------------------------------

const PATH_COMMANDS = "MmLlQqCcZz";

const COMMAND_ARITY: Readonly<Record<string, number | undefined>> = {
  M: 2,
  m: 2,
  L: 2,
  l: 2,
  Q: 4,
  q: 4,
  C: 6,
  c: 6,
  Z: 0,
  z: 0,
};

type PathToken =
  | { readonly kind: "command"; readonly value: string }
  | { readonly kind: "number"; readonly value: number };

/**
 * Split path data into command letters and numbers. Numbers may be separated
 * by whitespace or commas, or by nothing at all (`-.5.5` is two numbers).
 */
function tokenizePath(data: string): PathToken[] {
  const tokens: PathToken[] = [];
  let index = 0;
  while (index < data.length) {
    const character = data[index];
    if (isWhitespace(character) || character === ",") {
      index += 1;
      continue;
    }
    if (PATH_COMMANDS.includes(character)) {
      tokens.push({ kind: "command", value: character });
      index += 1;
      continue;
    }
    if (/[A-Za-z]/.test(character)) {
      throw new Error(`Unsupported SVG path command "${character}"`);
    }
    const scanned = scanNumber(data, index);
    if (scanned === undefined) {
      throw new Error(`Unexpected character "${character}" in path data`);
    }
    tokens.push({ kind: "number", value: scanned.value });
    index = scanned.end;
  }
  return tokens;
}

/** One absolute segment (or close marker) of a subpath, in pre-CTM user space. */
type SubpathPart =
  | { readonly kind: "line"; readonly to: Point }
  | { readonly kind: "quadratic"; readonly control: Point; readonly to: Point }
  | {
      readonly kind: "cubic";
      readonly control1: Point;
      readonly control2: Point;
      readonly to: Point;
    }
  | { readonly kind: "close" };

/** A single subpath: its `M` origin followed by its ordered parts. */
interface Subpath {
  readonly start: Point;
  readonly parts: readonly SubpathPart[];
}

function emitSegment(command: string, points: readonly Point[], ctm: Affine): string {
  let text = command;
  for (const point of points) {
    const baked = apply(ctm, point);
    text += `${formatNumber(baked.x)} ${formatNumber(baked.y)} `;
  }
  return text.trimEnd();
}

/**
 * Parse path data into subpaths of absolute segments and close markers.
 *
 * Relative commands are converted to absolute ones (an affine map is
 * equivariant, so transforming control points is exact for lines, quadratics
 * and cubics), but the command letters and order are preserved so that baking
 * emits the same bytes as before. Curves stay curves; flattening happens later
 * and only to reason about which subpaths contain which.
 */
function parseSubpaths(data: string): Subpath[] {
  const tokens = tokenizePath(data);
  const subpaths: Subpath[] = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let index = 0;
  let current: { start: Point; parts: SubpathPart[] } | undefined;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.kind !== "command") {
      throw new Error("SVG path data must start each segment with a command");
    }
    let command = token.value;
    index += 1;

    if (command === "Z" || command === "z") {
      if (current !== undefined) {
        current.parts.push({ kind: "close" });
      }
      // After a close, the current point returns to the subpath start.
      currentX = startX;
      currentY = startY;
      continue;
    }

    const arity = COMMAND_ARITY[command];
    if (arity === undefined) {
      throw new Error(`Unsupported SVG path command "${command}"`);
    }

    let group: number[] = [];
    while (index < tokens.length) {
      const next = tokens[index];
      if (next.kind !== "number") {
        break;
      }
      group.push(next.value);
      index += 1;
      if (group.length < arity) {
        continue;
      }
      const relative = command === command.toLowerCase();
      const absolute = command.toUpperCase();
      const pointAt = (offset: number): Point => {
        const x = group[offset];
        const y = group[offset + 1];
        return relative ? { x: currentX + x, y: currentY + y } : { x, y };
      };
      if (absolute === "M") {
        const point = pointAt(0);
        current = { start: point, parts: [] };
        subpaths.push(current);
        currentX = point.x;
        currentY = point.y;
        startX = point.x;
        startY = point.y;
      } else {
        if (current === undefined) {
          // Geometry before any moveto: keep it, anchored at the origin as the
          // previous baker did, instead of dropping it.
          current = { start: { x: 0, y: 0 }, parts: [] };
          subpaths.push(current);
        }
        if (absolute === "L") {
          const to = pointAt(0);
          current.parts.push({ kind: "line", to });
          currentX = to.x;
          currentY = to.y;
        } else if (absolute === "Q") {
          const control = pointAt(0);
          const to = pointAt(2);
          current.parts.push({ kind: "quadratic", control, to });
          currentX = to.x;
          currentY = to.y;
        } else {
          const control1 = pointAt(0);
          const control2 = pointAt(2);
          const to = pointAt(4);
          current.parts.push({ kind: "cubic", control1, control2, to });
          currentX = to.x;
          currentY = to.y;
        }
      }
      group = [];
      // Per the SVG grammar a repeated moveto is an implicit lineto.
      if (command === "M") {
        command = "L";
      } else if (command === "m") {
        command = "l";
      }
    }
    if (group.length !== 0) {
      throw new Error("Incomplete SVG path segment");
    }
  }

  return subpaths;
}

/** Bake one subpath's CTM into absolute, viewport-space segment text. */
function bakeSubpath(subpath: Subpath, ctm: Affine): string {
  let text = emitSegment("M", [subpath.start], ctm);
  for (const part of subpath.parts) {
    switch (part.kind) {
      case "line":
        text += emitSegment("L", [part.to], ctm);
        break;
      case "quadratic":
        text += emitSegment("Q", [part.control, part.to], ctm);
        break;
      case "cubic":
        text += emitSegment("C", [part.control1, part.control2, part.to], ctm);
        break;
      case "close":
        text += "Z";
        break;
    }
  }
  return text;
}

/** Bake every subpath, concatenated in original order (one `d` value). */
function bakeSubpaths(subpaths: readonly Subpath[], ctm: Affine): string {
  let text = "";
  for (const subpath of subpaths) {
    text += bakeSubpath(subpath, ctm);
  }
  return text;
}

// ---------------------------------------------------------------------------
// even-odd subpath decomposition
// ---------------------------------------------------------------------------

/** Curve samples per segment when flattening; enough to reveal containment. */
const CURVE_SAMPLES = 20;

/** Dead zone for treating an orientation value as zero (collinear points). */
const COLLINEAR_EPSILON = 1e-9;

/** A point on a quadratic Bezier at parameter `t` in `[0, 1]`. */
function quadraticPoint(from: Point, control: Point, to: Point, t: number): Point {
  const inverse = 1 - t;
  const a = inverse * inverse;
  const b = 2 * inverse * t;
  const c = t * t;
  return {
    x: a * from.x + b * control.x + c * to.x,
    y: a * from.y + b * control.y + c * to.y,
  };
}

/** A point on a cubic Bezier at parameter `t` in `[0, 1]`. */
function cubicPoint(
  from: Point,
  control1: Point,
  control2: Point,
  to: Point,
  t: number,
): Point {
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return {
    x: a * from.x + b * control1.x + c * control2.x + d * to.x,
    y: a * from.y + b * control1.y + c * control2.y + d * to.y,
  };
}

/**
 * Flatten a subpath into an implicitly closed polygon in viewport space.
 *
 * This approximation is used only to decide which subpaths contain which; the
 * emitted path always keeps its original curves.
 */
function flattenSubpath(subpath: Subpath, ctm: Affine): Point[] {
  const points: Point[] = [apply(ctm, subpath.start)];
  let current = subpath.start;
  for (const part of subpath.parts) {
    switch (part.kind) {
      case "line":
        points.push(apply(ctm, part.to));
        current = part.to;
        break;
      case "quadratic":
        for (let sample = 1; sample <= CURVE_SAMPLES; sample += 1) {
          const t = sample / CURVE_SAMPLES;
          points.push(apply(ctm, quadraticPoint(current, part.control, part.to, t)));
        }
        current = part.to;
        break;
      case "cubic":
        for (let sample = 1; sample <= CURVE_SAMPLES; sample += 1) {
          const t = sample / CURVE_SAMPLES;
          points.push(
            apply(ctm, cubicPoint(current, part.control1, part.control2, part.to, t)),
          );
        }
        current = part.to;
        break;
      case "close":
        points.push(apply(ctm, subpath.start));
        current = subpath.start;
        break;
    }
  }
  return points;
}

/** Twice the signed area of a polygon (its sign encodes the winding). */
function signedArea(polygon: readonly Point[]): number {
  let total = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/** Cross product `(b - a) x (c - a)`; zero when the three points are collinear. */
function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** `-1`, `0` or `1` for the sign of an orientation, with a small dead zone. */
function signOf(value: number): number {
  if (value > COLLINEAR_EPSILON) {
    return 1;
  }
  if (value < -COLLINEAR_EPSILON) {
    return -1;
  }
  return 0;
}

/** Whether `value` lies between `first` and `second` (within floating-point slack). */
function between(value: number, first: number, second: number): boolean {
  return (
    value >= Math.min(first, second) - COLLINEAR_EPSILON &&
    value <= Math.max(first, second) + COLLINEAR_EPSILON
  );
}

/** Whether `point` sits on an edge of `polygon` (within floating-point slack). */
function pointOnBoundary(polygon: readonly Point[], point: Point): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (
      signOf(orientation(a, b, point)) === 0 &&
      between(point.x, a.x, b.x) &&
      between(point.y, a.y, b.y)
    ) {
      return true;
    }
  }
  return false;
}

/** Ray-cast point-in-polygon test; interior only, boundary is unspecified. */
function pointInPolygon(polygon: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[index === 0 ? polygon.length - 1 : index - 1];
    const crosses =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A point strictly inside `polygon`: the midpoint of an edge stepped a short
 * way along its inward normal. Anchoring to an edge (rather than, say, the
 * centroid) keeps the sample in the subpath's own shell and clear of nested
 * holes, which is what makes the smallest-containing-subpath parent test hold.
 */
function interiorPoint(polygon: readonly Point[]): Point | undefined {
  if (polygon.length < 3) {
    return undefined;
  }
  const windingSign = signedArea(polygon) >= 0 ? 1 : -1;
  const fractions = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const deltaX = b.x - a.x;
    const deltaY = b.y - a.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length < EPSILON) {
      continue;
    }
    const midpoint: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const normalX = (-deltaY / length) * windingSign;
    const normalY = (deltaX / length) * windingSign;
    for (const fraction of fractions) {
      const candidate: Point = {
        x: midpoint.x + normalX * length * fraction,
        y: midpoint.y + normalY * length * fraction,
      };
      if (pointInPolygon(polygon, candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function boundsOf(polygon: readonly Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function boundsOverlap(first: Bounds, second: Bounds): boolean {
  return (
    first.minX <= second.maxX &&
    second.minX <= first.maxX &&
    first.minY <= second.maxY &&
    second.minY <= first.maxY
  );
}

/** Whether two segments cross transversally (grazing or touching counts not). */
function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const first = signOf(orientation(a1, a2, b1));
  const second = signOf(orientation(a1, a2, b2));
  const third = signOf(orientation(b1, b2, a1));
  const fourth = signOf(orientation(b1, b2, a2));
  return first * second < 0 && third * fourth < 0;
}

/** Whether a vertex of `first` lies strictly interior to `second`. */
function hasInteriorVertex(
  first: readonly Point[],
  second: readonly Point[],
): boolean {
  for (const point of first) {
    if (pointInPolygon(second, point) && !pointOnBoundary(second, point)) {
      return true;
    }
  }
  return false;
}

/** Whether two polygons share interior area (a partial or full overlap). */
function polygonsOverlap(
  first: readonly Point[],
  second: readonly Point[],
): boolean {
  if (!boundsOverlap(boundsOf(first), boundsOf(second))) {
    return false;
  }
  if (hasInteriorVertex(first, second) || hasInteriorVertex(second, first)) {
    return true;
  }
  for (let index = 0; index < first.length; index += 1) {
    const firstStart = first[index];
    const firstEnd = first[(index + 1) % first.length];
    for (let other = 0; other < second.length; other += 1) {
      const secondStart = second[other];
      const secondEnd = second[(other + 1) % second.length];
      if (segmentsCross(firstStart, firstEnd, secondStart, secondEnd)) {
        return true;
      }
    }
  }
  return false;
}

/** Whether `ancestor` is anywhere above `node` in the parent chain. */
function isAncestor(
  parents: ReadonlyArray<number | undefined>,
  ancestor: number,
  node: number,
): boolean {
  let current = parents[node];
  while (current !== undefined) {
    if (current === ancestor) {
      return true;
    }
    current = parents[current];
  }
  return false;
}

interface SubpathPiece {
  readonly depth: number;
  readonly index: number;
  readonly elements: readonly string[];
}

/** Serialize one emitted `<path>`, with `fill-rule` only for a hole group. */
function renderPathElement(
  d: string,
  paint: readonly string[],
  evenOdd: boolean,
): string {
  const attributes: string[] = [`d="${escapeAttribute(d)}"`];
  if (evenOdd) {
    attributes.push(`fill-rule="evenodd"`);
  }
  for (const attribute of paint) {
    attributes.push(attribute);
  }
  return `<path ${attributes.join(" ")}/>`;
}

/**
 * An invisible, viewport-sized fill emitted directly before an even-odd group
 * that has two or more holes.
 *
 * Pixi's `cut()` attaches each cut after the first to the instruction before
 * the group as well as to the group's own fill, so this barrier takes those
 * stray holes instead of the preceding shape. It is fully transparent and
 * produces no visible output.
 */
function renderBarrier(width: number, height: number): string {
  const right = formatNumber(width);
  const bottom = formatNumber(height);
  const d = `M0 0L${right} 0L${right} ${bottom}L0 ${bottom}Z`;
  return renderPathElement(d, ['fill="#000000"', 'fill-opacity="0"'], false);
}

/**
 * Rewrite an even-odd path with multiple subpaths into paths Pixi can render.
 *
 * Pixi cannot reproduce a general even-odd fill, but it can reproduce a
 * two-level one: with `fill-rule="evenodd"` it fills the largest subpath and
 * `cut()`s the rest. The exported subpaths form a clean nesting forest, so an
 * even-depth subpath plus its direct children is exactly such a two-level
 * shape (parent filled, immediate holes cut), while disjoint subpaths and
 * deeper even levels are emitted on their own. Anything that is not a clean
 * forest is rejected rather than silently mis-rendered.
 *
 * Groups with two or more holes additionally get a zero-area sentinel subpath
 * (to force Pixi down its deterministic multi-hole branch) and an invisible
 * barrier before them (to absorb that branch's `cut()` spill). See the module
 * header.
 */
function decomposeSubpaths(
  subpaths: readonly Subpath[],
  ctm: Affine,
  paint: readonly string[],
  description: string,
  raw: string,
  viewportWidth: number,
  viewportHeight: number,
): string[] {
  const polygons = subpaths.map((subpath) => flattenSubpath(subpath, ctm));
  const areas = polygons.map((polygon) => Math.abs(signedArea(polygon)));
  const interiors = polygons.map((polygon) => interiorPoint(polygon));

  // Parent = the smallest-area subpath (necessarily larger than the child)
  // whose polygon strictly contains the subpath's interior sample.
  const parents: Array<number | undefined> = polygons.map((_, index) => {
    const interior = interiors[index];
    if (interior === undefined) {
      return undefined;
    }
    let parent: number | undefined;
    for (let other = 0; other < polygons.length; other += 1) {
      if (other === index || areas[other] <= areas[index]) {
        continue;
      }
      if (!pointInPolygon(polygons[other], interior)) {
        continue;
      }
      if (parent === undefined || areas[other] < areas[parent]) {
        parent = other;
      }
    }
    return parent;
  });

  const depthOf = (index: number): number => {
    const parent = parents[index];
    return parent === undefined ? 0 : depthOf(parent) + 1;
  };
  const depths = polygons.map((_, index) => depthOf(index));
  const children: number[][] = polygons.map(() => []);
  for (let index = 0; index < polygons.length; index += 1) {
    const parent = parents[index];
    if (parent !== undefined) {
      children[parent].push(index);
    }
  }

  // Fail fast unless this is a clean nesting forest: every child is contained
  // in its parent, and subpaths without an ancestor relation are disjoint.
  for (let index = 0; index < polygons.length; index += 1) {
    const parent = parents[index];
    if (parent === undefined) {
      continue;
    }
    for (const vertex of polygons[index]) {
      if (
        !pointInPolygon(polygons[parent], vertex) &&
        !pointOnBoundary(polygons[parent], vertex)
      ) {
        throw new Error(
          `SVG subpath ${index} is not contained in its parent subpath ${parent} on ${description} (${describeInput(raw)})`,
        );
      }
    }
  }
  for (let first = 0; first < polygons.length; first += 1) {
    if (interiors[first] === undefined) {
      continue;
    }
    for (let second = first + 1; second < polygons.length; second += 1) {
      if (interiors[second] === undefined) {
        continue;
      }
      if (isAncestor(parents, first, second) || isAncestor(parents, second, first)) {
        continue;
      }
      if (polygonsOverlap(polygons[first], polygons[second])) {
        throw new Error(
          `SVG subpaths ${first} and ${second} overlap without nesting on ${description}; even-odd fill cannot be decomposed (${describeInput(raw)})`,
        );
      }
    }
  }

  // A group of one needs no `fill-rule`; a group of several becomes one
  // even-odd path whose parent Pixi fills and whose direct children it cuts.
  const pieces: SubpathPiece[] = [];
  for (let index = 0; index < subpaths.length; index += 1) {
    if (depths[index] % 2 !== 0) {
      continue;
    }
    const group = [index, ...children[index]];
    let d = "";
    for (const member of group) {
      d += bakeSubpath(subpaths[member], ctm);
    }
    const elements: string[] = [];
    if (group.length > 2) {
      // Pixi takes its multi-hole branch unconditionally only for paths with
      // more than three subpaths; exactly three falls back to a heuristic that
      // can fill a sibling hole, so pad the count with an inert contour.
      if (group.length === 3) {
        d += " M0 0";
      }
      // The branch's 2nd and later cuts also spill onto the instruction
      // before this path; the barrier takes those stray holes instead.
      elements.push(renderBarrier(viewportWidth, viewportHeight));
    }
    elements.push(renderPathElement(d, paint, group.length > 1));
    pieces.push({ depth: depths[index], index, elements });
  }
  pieces.sort(
    (left, right) => left.depth - right.depth || left.index - right.index,
  );
  return pieces.flatMap((piece) => piece.elements);
}

// ---------------------------------------------------------------------------
// gradients
// ---------------------------------------------------------------------------

interface GradientStop {
  readonly attributes: ReadonlyArray<readonly [string, string]>;
}

interface GradientCommon {
  readonly id: string;
  readonly gradientTransform: Affine;
  readonly spreadMethod: string;
  readonly stops: ReadonlyArray<GradientStop>;
}

interface LinearGradientData extends GradientCommon {
  readonly kind: "linear";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface RadialGradientData extends GradientCommon {
  readonly kind: "radial";
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly fx: number;
  readonly fy: number;
  readonly fr: number;
}

type GradientData = LinearGradientData | RadialGradientData;

/**
 * Resolve a gradient coordinate that may be a percentage. Percentages are
 * relative to the viewport: width for x, height for y, the normalised diagonal
 * for a radius.
 */
function resolveCoordinate(
  value: string | null,
  basis: number,
  fallback: number,
): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const percentage = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(percentage)) {
      throw new Error(`Invalid gradient percentage "${value}"`);
    }
    return (percentage / 100) * basis;
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid gradient coordinate "${value}"`);
  }
  return number;
}

/** Collect attribute name/value pairs verbatim (used for `<stop>` children). */
function attributePairs(element: Element): Array<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  const attributes = element.attributes;
  for (let index = 0; index < attributes.length; index += 1) {
    const attribute = attributes.item(index);
    if (attribute !== null) {
      pairs.push([attribute.name, attribute.value]);
    }
  }
  return pairs;
}

function parseGradientElement(
  element: Element,
  width: number,
  height: number,
): GradientData | undefined {
  const id = optionalAttribute(element, "id");
  if (id === null) {
    return undefined;
  }
  const units = element.getAttribute("gradientUnits") ?? "objectBoundingBox";
  if (units !== "userSpaceOnUse") {
    throw new Error(
      `Unsupported gradientUnits="${units}" on "#${id}"; only userSpaceOnUse is supported`,
    );
  }
  const transformAttribute = element.getAttribute("gradientTransform");
  const gradientTransform =
    transformAttribute === null ? IDENTITY : parseTransform(transformAttribute);
  const spreadMethod = element.getAttribute("spreadMethod") ?? "pad";
  const stops = childElements(element)
    .filter((child) => child.localName === "stop")
    .map((stop) => ({ attributes: attributePairs(stop) }));

  if (element.localName === "linearGradient") {
    return {
      kind: "linear",
      id,
      gradientTransform,
      spreadMethod,
      stops,
      x1: resolveCoordinate(element.getAttribute("x1"), width, 0),
      y1: resolveCoordinate(element.getAttribute("y1"), height, 0),
      x2: resolveCoordinate(element.getAttribute("x2"), width, width),
      y2: resolveCoordinate(element.getAttribute("y2"), height, 0),
    };
  }

  const diagonal = Math.sqrt((width * width + height * height) / 2);
  const cx = resolveCoordinate(element.getAttribute("cx"), width, width / 2);
  const cy = resolveCoordinate(element.getAttribute("cy"), height, height / 2);
  return {
    kind: "radial",
    id,
    gradientTransform,
    spreadMethod,
    stops,
    cx,
    cy,
    r: resolveCoordinate(element.getAttribute("r"), diagonal, diagonal / 2),
    fx: resolveCoordinate(element.getAttribute("fx"), width, cx),
    fy: resolveCoordinate(element.getAttribute("fy"), height, cy),
    fr: resolveCoordinate(element.getAttribute("fr"), diagonal, 0),
  };
}

/** Walk every element (anywhere in the document, document order agnostic). */
function collectGradients(
  root: Element,
  width: number,
  height: number,
): Map<string, GradientData> {
  const gradients = new Map<string, GradientData>();
  const visit = (element: Element): void => {
    for (const child of childElements(element)) {
      const name = child.localName;
      if (name === "linearGradient" || name === "radialGradient") {
        const gradient = parseGradientElement(child, width, height);
        if (gradient !== undefined) {
          gradients.set(gradient.id, gradient);
        }
      }
      visit(child);
    }
  };
  visit(root);
  return gradients;
}

function renderStops(stops: ReadonlyArray<GradientStop>): string {
  let text = "";
  for (const stop of stops) {
    text += "<stop";
    for (const [name, value] of stop.attributes) {
      text += ` ${name}="${escapeAttribute(value)}"`;
    }
    text += "/>";
  }
  return text;
}

/**
 * Fold `M_eff = CTM * gradientTransform` into a linear gradient.
 *
 * The SVG colour-parameter field is
 * `t(P) = ((M_eff^-1(P) - p1) . u) / L` with `u = p2 - p1`. Because that field
 * is affine, Pixi's `start`/`end` can reproduce it exactly: with
 * `g = A^-T (u / L)` and `k = g.g`, the field equals `P.g + gamma`, where
 * `gamma = -(p1.u)/L`. Choosing `start = t - (gamma/k) g` (any point with
 * `start.g = -gamma` works; adding the translation keeps the endpoints in the
 * same viewport frame as the baked geometry) and `end = start + g/k` gives a
 * projection whose values match the true field everywhere -- verified to
 * floating-point precision. Naively transforming `p1`/`p2` is NOT equivalent:
 * a shear changes the field even though the two endpoint values coincide.
 */
function renderLinearGradient(
  gradient: LinearGradientData,
  id: string,
  ctm: Affine,
): string {
  const matrix = multiply(ctm, gradient.gradientTransform);
  const p1: Point = { x: gradient.x1, y: gradient.y1 };
  const p2: Point = { x: gradient.x2, y: gradient.y2 };
  const ux = p2.x - p1.x;
  const uy = p2.y - p1.y;
  const lengthSquared = ux * ux + uy * uy;
  const det = determinant(matrix);

  let start: Point;
  let end: Point;
  if (lengthSquared === 0 || Math.abs(det) < EPSILON) {
    // Degenerate gradient/transform: fall back to transformed endpoints.
    start = apply(matrix, p1);
    end = apply(matrix, p2);
  } else {
    // Solve A^T g = u / L for the gradient direction of the parameter field.
    const rx = ux / lengthSquared;
    const ry = uy / lengthSquared;
    const gx = (rx * matrix.d - matrix.b * ry) / det;
    const gy = (matrix.a * ry - matrix.c * rx) / det;
    const k = gx * gx + gy * gy;
    if (k === 0) {
      start = apply(matrix, p1);
      end = apply(matrix, p2);
    } else {
      const gamma = -(p1.x * ux + p1.y * uy) / lengthSquared;
      start = {
        x: matrix.e - (gamma / k) * gx,
        y: matrix.f - (gamma / k) * gy,
      };
      end = { x: start.x + gx / k, y: start.y + gy / k };
    }
  }

  return (
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"` +
    ` spreadMethod="${escapeAttribute(gradient.spreadMethod)}"` +
    ` x1="${formatNumber(start.x)}" y1="${formatNumber(start.y)}"` +
    ` x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}">` +
    `${renderStops(gradient.stops)}</linearGradient>`
  );
}

/**
 * Fold `M_eff = CTM * gradientTransform` into a radial gradient. All radial
 * `gradientTransform`s in this project are uniform scales, for which mapping
 * the centres and scaling the radius by `sqrt(|det A|)` is exact. A
 * non-uniform or sheared radial gradient (an ellipse) cannot be represented by
 * Pixi's circular radial gradients and would need to be rasterized.
 */
function renderRadialGradient(
  gradient: RadialGradientData,
  id: string,
  ctm: Affine,
): string {
  const matrix = multiply(ctm, gradient.gradientTransform);
  const scale = scaleFactor(matrix);
  const outer = apply(matrix, { x: gradient.cx, y: gradient.cy });
  const center = apply(matrix, { x: gradient.fx, y: gradient.fy });
  const outerRadius = gradient.r * scale;
  const innerRadius = gradient.fr * scale;
  return (
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse"` +
    ` spreadMethod="${escapeAttribute(gradient.spreadMethod)}"` +
    ` cx="${formatNumber(outer.x)}" cy="${formatNumber(outer.y)}"` +
    ` r="${formatNumber(outerRadius)}"` +
    ` fx="${formatNumber(center.x)}" fy="${formatNumber(center.y)}"` +
    ` fr="${formatNumber(innerRadius)}">` +
    `${renderStops(gradient.stops)}</radialGradient>`
  );
}

function renderGradient(gradient: GradientData, id: string, ctm: Affine): string {
  return gradient.kind === "linear"
    ? renderLinearGradient(gradient, id, ctm)
    : renderRadialGradient(gradient, id, ctm);
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function childElements(element: Element): Element[] {
  const children: Element[] = [];
  const nodes = element.childNodes;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes.item(index);
    if (node !== null && node.nodeType === 1) {
      children.push(node as Element);
    }
  }
  return children;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Read an attribute, treating a missing or empty value as absent. Browsers
 * return `null` for missing attributes, some XML DOMs return `""`, and Pixi's
 * own parser treats an empty attribute as absent too.
 */
function optionalAttribute(element: Element, name: string): string | null {
  const value = element.getAttribute(name);
  return value === null || value.trim() === "" ? null : value;
}

function describeInput(raw: unknown): string {
  if (typeof raw !== "string") {
    return `non-string input of type ${typeof raw}`;
  }
  const snippet = raw.slice(0, 80).replace(/\s+/g, " ").trim();
  return `input starts with "${snippet}"`;
}

// ---------------------------------------------------------------------------
// width / height / viewBox
// ---------------------------------------------------------------------------

function parseViewportLength(
  value: string | null,
  name: string,
  raw: string,
): number {
  if (value === null) {
    throw new Error(
      `SVG is missing the required "${name}" attribute (${describeInput(raw)})`,
    );
  }
  const number = Number(value.trim().replace(/px$/i, ""));
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(
      `SVG has an invalid "${name}" attribute "${value}" (${describeInput(raw)})`,
    );
  }
  return number;
}

interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function parseViewBox(value: string | null, raw: string): ViewBox | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const numbers = scanNumbers(value.trim());
  if (numbers.length !== 4) {
    throw new Error(
      `SVG has a malformed "viewBox" attribute "${value}" (${describeInput(raw)})`,
    );
  }
  const [x, y, width, height] = numbers;
  if (width <= 0 || height <= 0) {
    throw new Error(
      `SVG has a non-positive viewBox size "${value}" (${describeInput(raw)})`,
    );
  }
  return { x, y, width, height };
}

/**
 * Outermost transform `R` that maps viewBox coordinates into the viewport:
 * `((x - minX) * width / vbWidth, (y - minY) * height / vbHeight)`.
 */
function viewBoxTransform(viewBox: ViewBox, width: number, height: number): Affine {
  const sx = width / viewBox.width;
  const sy = height / viewBox.height;
  return { a: sx, b: 0, c: 0, d: sy, e: -viewBox.x * sx, f: -viewBox.y * sy };
}

// ---------------------------------------------------------------------------
// supported-subset validation
// ---------------------------------------------------------------------------

/** Elements the normalizer can faithfully rewrite for Pixi's vector parser. */
const SUPPORTED_ELEMENTS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "path",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
]);

/** Attribute names that never affect how the supported subset renders. */
const IGNORABLE_ATTRIBUTE_PREFIXES = ["xmlns", "xml:", "data-", "aria-"] as const;

function isIgnorableAttribute(name: string): boolean {
  return (
    name === "id" ||
    name === "class" ||
    IGNORABLE_ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/** `<path id="foo">` when an id is present, `<path>` otherwise. */
function describeElement(element: Element): string {
  const id = element.getAttribute("id");
  if (id === null) {
    return `<${element.localName}>`;
  }
  return `<${element.localName} id="${id}">`;
}

/**
 * Attribute allowlist per supported element. It is built when validation runs
 * so `PRESERVED_ATTRIBUTES` (declared in the public API section below) is
 * already initialized. Element names absent from the allowlist are rejected by
 * `SUPPORTED_ELEMENTS` before the list is consulted.
 */
function attributeAllowList(): Readonly<Record<string, ReadonlySet<string>>> {
  return {
    svg: new Set(["width", "height", "viewBox", "transform", "version"]),
    g: new Set(["transform"]),
    defs: new Set<string>(),
    path: new Set(["d", "transform", "fill-rule", ...PRESERVED_ATTRIBUTES]),
    linearGradient: new Set([
      "id",
      "gradientUnits",
      "gradientTransform",
      "spreadMethod",
      "x1",
      "y1",
      "x2",
      "y2",
    ]),
    radialGradient: new Set([
      "id",
      "gradientUnits",
      "gradientTransform",
      "spreadMethod",
      "cx",
      "cy",
      "r",
      "fx",
      "fy",
      "fr",
    ]),
    stop: new Set(["offset", "stop-color"]),
  };
}

/**
 * Reject every element and attribute outside the subset the normalizer can
 * faithfully rewrite, so unsupported art fails loudly instead of silently
 * mis-rendering under Pixi's vector parser.
 */
function validateSupportedSubset(raw: string, root: Element): void {
  const allowList = attributeAllowList();
  const visit = (element: Element, isRoot: boolean): void => {
    const name = element.localName;
    if (!SUPPORTED_ELEMENTS.has(name)) {
      throw new Error(
        `Unsupported SVG element ${describeElement(element)} (${describeInput(raw)})`,
      );
    }
    for (const [attributeName] of attributePairs(element)) {
      if (attributeName === "style") {
        throw new Error(
          `Unsupported attribute "style" on ${describeElement(element)} (${describeInput(raw)})`,
        );
      }
      if (isIgnorableAttribute(attributeName)) {
        continue;
      }
      if (!allowList[name].has(attributeName)) {
        throw new Error(
          `Unsupported attribute "${attributeName}" on ${describeElement(element)} (${describeInput(raw)})`,
        );
      }
    }
    if (!isRoot && name === "svg" && element.getAttribute("viewBox") !== null) {
      throw new Error(
        `Nested <svg> with a "viewBox" is not supported; only the root viewBox is applied (${describeInput(raw)})`,
      );
    }
    if (name === "linearGradient" || name === "radialGradient") {
      const spreadMethod = element.getAttribute("spreadMethod");
      if (spreadMethod !== null && spreadMethod !== "pad") {
        throw new Error(
          `Unsupported spreadMethod="${spreadMethod}" on ${describeElement(element)}; only "pad" is supported (${describeInput(raw)})`,
        );
      }
    }
    if (name === "path") {
      const fillRule = element.getAttribute("fill-rule");
      if (fillRule !== null && fillRule !== "evenodd") {
        throw new Error(
          `Unsupported fill-rule="${fillRule}" on ${describeElement(element)}; only "evenodd" is supported (${describeInput(raw)})`,
        );
      }
    }
    for (const child of childElements(element)) {
      visit(child, false);
    }
  };
  visit(root, true);
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

const URL_REFERENCE = /^url\(\s*#([^)\s]+)\s*\)$/;

/** Attribute names Pixi's style parser understands and we want to preserve. */
const PRESERVED_ATTRIBUTES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
] as const;

function extractGradientId(value: string): string | undefined {
  const match = URL_REFERENCE.exec(value.trim());
  return match === null ? undefined : match[1];
}

function hasStroke(element: Element): boolean {
  const stroke = element.getAttribute("stroke");
  return stroke !== null && stroke.trim() !== "none";
}

function scaleDashArray(value: string, scale: number): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "none") {
    return "none";
  }
  const numbers = scanNumbers(trimmed);
  if (numbers.length === 0) {
    return trimmed;
  }
  return numbers.map((number) => formatNumber(number * scale)).join(" ");
}

function affineKey(matrix: Affine): string {
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
    .map((value) => value.toFixed(6))
    .join(",");
}

/**
 * Bake transforms into an SWF-exported SVG so Pixi's vector importer can
 * render it.
 *
 * @param raw - the original SVG source text.
 * @throws when the input is not a parseable SVG with `width`/`height`.
 */
export function normalizeSvg(raw: string): NormalizedSvg {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`normalizeSvg expected a non-empty SVG string (${describeInput(raw)})`);
  }

  let document: Document;
  try {
    document = new DOMParser().parseFromString(raw, "image/svg+xml");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse SVG: ${message} (${describeInput(raw)})`);
  }
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`Failed to parse SVG: malformed XML (${describeInput(raw)})`);
  }

  const root: Element | null = document.documentElement;
  if (root === null || root.localName !== "svg") {
    throw new Error(`normalizeSvg expected an <svg> root element (${describeInput(raw)})`);
  }

  validateSupportedSubset(raw, root);

  const width = parseViewportLength(root.getAttribute("width"), "width", raw);
  const height = parseViewportLength(root.getAttribute("height"), "height", raw);
  const viewBox = parseViewBox(root.getAttribute("viewBox"), raw);
  const rootTransform =
    viewBox === undefined ? IDENTITY : viewBoxTransform(viewBox, width, height);

  // Collect every gradient up front: `<defs>` may appear after the geometry.
  const gradients = collectGradients(root, width, height);

  const definitions: string[] = [];
  const clones = new Map<string, string>();
  let cloneCount = 0;

  /**
   * Resolve a paint reference. The same gradient referenced from paths with
   * different CTMs needs a separate definition (its baked coordinates differ),
   * so we clone per distinct (id, CTM, gradientTransform) and share otherwise.
   */
  const resolveReference = (value: string, ctm: Affine): string => {
    const id = extractGradientId(value);
    if (id === undefined) {
      return value;
    }
    const gradient = gradients.get(id);
    if (gradient === undefined) {
      throw new Error(
        `SVG references unknown gradient "#${id}" (${describeInput(raw)})`,
      );
    }
    const key = `${id}|${affineKey(ctm)}|${affineKey(gradient.gradientTransform)}`;
    const existing = clones.get(key);
    if (existing !== undefined) {
      return `url(#${existing})`;
    }
    const cloneId = `normGradient${cloneCount}`;
    cloneCount += 1;
    definitions.push(renderGradient(gradient, cloneId, ctm));
    clones.set(key, cloneId);
    return `url(#${cloneId})`;
  };

  /** Paint attributes shared by every piece an input `<path>` is split into. */
  const buildPaintAttributes = (path: Element, ctm: Affine): string[] => {
    const scale = scaleFactor(ctm);
    const stroked = hasStroke(path);
    const attributes: string[] = [];
    for (const name of PRESERVED_ATTRIBUTES) {
      const value = path.getAttribute(name);
      if (value === null) {
        continue;
      }
      if (name === "fill" || name === "stroke") {
        attributes.push(
          `${name}="${escapeAttribute(resolveReference(value.trim(), ctm))}"`,
        );
      } else if (name === "stroke-width" && stroked) {
        const number = Number(value.trim().replace(/px$/i, ""));
        attributes.push(
          Number.isFinite(number)
            ? `${name}="${formatNumber(number * scale)}"`
            : `${name}="${escapeAttribute(value)}"`,
        );
      } else if ((name === "stroke-dasharray" || name === "stroke-dashoffset") && stroked) {
        attributes.push(`${name}="${escapeAttribute(scaleDashArray(value, scale))}"`);
      } else {
        attributes.push(`${name}="${escapeAttribute(value)}"`);
      }
    }
    return attributes;
  };

  const renderPath = (path: Element, ctm: Affine): string[] => {
    const data = path.getAttribute("d");
    if (data === null || data.trim() === "") {
      throw new Error(
        `SVG <path> is missing its "d" attribute (${describeInput(raw)})`,
      );
    }
    const subpaths = parseSubpaths(data);
    const paint = buildPaintAttributes(path, ctm);
    if (path.getAttribute("fill-rule") === "evenodd" && subpaths.length >= 2) {
      return decomposeSubpaths(
        subpaths,
        ctm,
        paint,
        describeElement(path),
        raw,
        width,
        height,
      );
    }
    // `fill-rule` is emitted only by the even-odd decomposition above; a plain
    // path never carries it (see the module header).
    return [renderPathElement(bakeSubpaths(subpaths, ctm), paint, false)];
  };

  const geometry: string[] = [];
  const walk = (element: Element, ctm: Affine): void => {
    const name = element.localName;
    if (name === "path") {
      const transformAttribute = element.getAttribute("transform");
      const pathCtm =
        transformAttribute === null
          ? ctm
          : multiply(ctm, parseTransform(transformAttribute));
      geometry.push(...renderPath(element, pathCtm));
      return;
    }
    if (name === "g" || name === "svg") {
      const transformAttribute = element.getAttribute("transform");
      const nextCtm =
        transformAttribute === null
          ? ctm
          : multiply(ctm, parseTransform(transformAttribute));
      for (const child of childElements(element)) {
        walk(child, nextCtm);
      }
    }
  };

  const rootLocalTransform = root.getAttribute("transform");
  const rootCtm =
    rootLocalTransform === null
      ? rootTransform
      : multiply(rootTransform, parseTransform(rootLocalTransform));
  for (const child of childElements(root)) {
    walk(child, rootCtm);
  }

  const definitionsBlock =
    definitions.length === 0 ? "" : `<defs>${definitions.join("")}</defs>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    ` width="${String(width)}" height="${String(height)}"` +
    ` viewBox="0 0 ${String(width)} ${String(height)}">` +
    `${definitionsBlock}${geometry.join("")}</svg>`;

  return { svg, width, height };
}
