/* Application / world geometry -------------------------------------------- */

/** Pixi canvas width and height; the world is a fixed 600x400 stage. */
export const GAME_WIDTH = 600;
export const GAME_HEIGHT = 400;

/** Room id used for both the `game` field and the `join` request. */
export const GAME_ID = "penguin1";
export const ROOM_ID = "penguin1";

/**
 * In-room room selector (SWF main-timeline frames 30-32, sprite 159):
 * circle-centre x and first-row centre y, matching `swf/frames/30.png`.
 */
export const WORLD_ROOM_RADIO_X = 477.5;
export const WORLD_ROOM_RADIO_FIRST_Y = 34.5;

/** Delay before `guest()` is sent and again while loading the world (ms). */
export const CONNECT_DELAY_MS = 800;

/** Device pixel ratio cap for the canvas and texture preference. */
export const MAX_RESOLUTION = 2;

/* Fonts -------------------------------------------------------------------- */

export const FONT_UI = "Arial, Helvetica, sans-serif";
export const FONT_NARROW = "Arial Narrow, Arial, sans-serif";

/* UI buttons (`Button`) ---------------------------------------------------- */

/** Button/label fill, hover fill, text color (0xFEBB00 / 0xFFEF80 / black). */
export const BUTTON_FILL = 0xfebb00;
export const BUTTON_HOVER_FILL = 0xffef80;
export const BUTTON_TEXT_COLOR = 0x000000;

/** Disabled button fill and disabled label color (0xCCCCCC / 0x888888). */
export const BUTTON_DISABLED_FILL = 0xcccccc;
export const BUTTON_DISABLED_TEXT = 0x888888;

/* Icon buttons (`IconButton`) ---------------------------------------------- */

/** Square icon button edge length and icon fill colors. */
export const ICON_BUTTON_SIZE = 22;
export const ICON_FILL = 0x003b77; // 15223
export const ICON_HOVER_FILL = 0x1a5aa0; // 1727136
export const ICON_DISABLED_FILL = 0xcccccc; // 13421772
/** Icon alpha while the button is disabled. */
export const ICON_DISABLED_ALPHA = 0.4;

/* Loading spinner ---------------------------------------------------------- */

/** Time for each quarter turn of the spinner (seconds). */
export const SPINNER_STEP_SECONDS = 0.5; // 10/20
/** Aspect ratio of the loading ring texture (192x132). */
export const RING_ASPECT = 192 / 132;
export const RING_WIDTH = 40;
export const RING_STROKE = 2;
export const RING_COLOR = 0x3399ff; // 3381759
/** Loading ring radiusY at the default width: 40 / (192/132). */
export const RING_HEIGHT = RING_WIDTH / RING_ASPECT; // 27.5

/* Screens / layout --------------------------------------------------------- */

/** Title texture position on the title/status screens. */
export const TITLE_POS = { x: 140, y: 34 } as const;
/** Centered Play / Try Again button position. */
export const MENU_BUTTON_POS = { x: 300, y: 305 } as const;
export const MENU_BUTTON_WIDTH = 100;
export const MENU_BUTTON_HEIGHT = 28;
/** Status screen message and spinner positions. */
export const STATUS_TEXT_POS = { x: 300, y: 253 } as const;
export const SPINNER_POS = { x: 300, y: 290 } as const;
/** End screen message position. */
export const END_TEXT_POS = { x: 300, y: 250 } as const;
/** RocketSnail footer baseline and spacing. */
export const FOOTER_Y = 390; // 390
export const FOOTER_TEXT_GAP = 2;
export const COPYRIGHT_TEXT_COLOR = 0x000000;
export const VERSION_TEXT_COLOR = 0xcccccc; // 13421772
export const GAME_VERSION = "1.20.2";

/* Chat log ----------------------------------------------------------------- */

/** Chat log panel geometry. */
export const LOG_X = 22;
export const LOG_PANEL_X = LOG_X - 8; // 14
export const LOG_Y = 30;
export const LOG_PANEL_WIDTH = 360;
export const LOG_PANEL_HEIGHT = 66;
export const LOG_LINE_HEIGHT = 13;
export const LOG_LINE_COUNT = 5;
/** Colors for the newest line and older lines (black / 0x666666). */
export const LOG_LATEST_COLOR = 0x000000;
export const LOG_OLDER_COLOR = 0x666666; // 6710886
export const LOG_BACKGROUND_COLOR = 0xffffff;
export const LOG_BACKGROUND_ALPHA = 0.6;
export const LOG_BORDER_WIDTH = 0.5;

/* Toolbar / chat input ----------------------------------------------------- */

/** Y position of the input row and toolbar buttons. */
export const TOOLBAR_Y = 348;
export const CHAT_INPUT_LEFT = 18;
export const CHAT_INPUT_WIDTH = 182;
export const CHAT_INPUT_HEIGHT = 22;
export const CHAT_INPUT_MAX_LENGTH = 60;
export const SEND_BUTTON_POS = { x: 210, y: TOOLBAR_Y } as const;
export const LOG_BUTTON_POS = { x: 236, y: TOOLBAR_Y } as const;
/** "res" button, immediately to the right of the log button (extended). */
export const RES_BUTTON_POS = { x: 262, y: TOOLBAR_Y } as const;
export const DISCONNECT_BUTTON_POS = { x: 560, y: TOOLBAR_Y } as const;

/** Canvas zooms cycled by the "res" button: 100% → 125% → 150% → 100%. */
export const RES_ZOOM_LEVELS = [1, 1.25, 1.5] as const;

/* Penguin sprite (`Penguin`) ----------------------------------------------- */

/** Number of walk directions in the spritesheet (move0..move7). */
export const PENGUIN_DIRECTIONS = 8;
/** Direction used for idling/spawning (facing the camera). */
export const PENGUIN_DEFAULT_DIRECTION = 4;
/** Walk speed in world units per second. */
export const PENGUIN_SPEED = 200;
/** AnimatedSprite animation speed. */
export const PENGUIN_ANIMATION_SPEED = 0.3;
/** Sprite anchor, so the penguin's feet line up with its world position. */
export const PENGUIN_ANCHOR_Y = 2 / 3;

/** Hole-transition timing tables: frame durations per phase (in 1/20s steps). */
export const HOLE_INTRO_TIMING = { open: 4, transit: 4, close: 2 } as const;
export const HOLE_DROP_TIMING = { open: 2, transit: 4, close: 3 } as const;
/** Seconds per transition timing step. */
export const HOLE_STEP_SECONDS = 1 / 20;
/** Sprite scale while it is down inside the hole. */
export const HOLE_SPRITE_SCALE = 0.3;

/* Critter type (server-synced) ---------------------------------------------- */

/** Critter `type` the server assigns to a plain penguin, and its default. */
export const CRITTER_TYPE_DEFAULT = "default";
/** Critter `type` sent on `join` (and broadcast) to be rendered as a snowcat. */
export const CRITTER_TYPE_SNOWCAT = "snowcat";

/* Snowcat sprite (`Snowcat`) ------------------------------------------------ */

/**
 * The original SWF places the snowcat at scale 0.439682.
 */
export const SNOWCAT_SCALE = 0.439682;

/**
 * The snowcat's composed origin offset. Its frames place the composed sprite at
 * `(3, 9)` twips in the SWF matrix; twips are 1/20 px.
 */
export const SNOWCAT_ORIGIN_OFFSET = { x: 3 / 20, y: 9 / 20 } as const;

/**
 * Seconds per underside pose while walking. The snowcat's underside sub-sprites
 * (`DefineSprite_121/131/133/135/137`) have two frames and the SWF plays at 20 fps.
 */
export const SNOWCAT_WALK_STEP_SECONDS = 1 / 20;

/** Name label offset under a snowcat: its tall body pushes the label further down. */
export const SNOWCAT_NAME_TEXT_OFFSET_Y = 48;

/**
 * Each shape's native SVG size plus its registration origin (the `<g transform>`
 * translate) within that space. `Snowcat` turns the origin into a sprite anchor
 * so every shape lines up on the character origin, exactly as the SWF places
 * them at `(0,0)`. Using the SVG's own size keeps the maths independent of how
 * Pixi rasterises the SVG.
 */
export const SNOWCAT_SHAPES: Record<
  number,
  { readonly origin: readonly [number, number]; readonly size: readonly [number, number] }
> = {
  118: { origin: [74.7, 46.35], size: [149.45, 138.85] },
  119: { origin: [40.55, 92.35], size: [97.95, 150.2] },
  120: { origin: [72.8, 48.4], size: [145.65, 141.85] },
  122: { origin: [72.2, 56.7], size: [144.45, 142.5] },
  123: { origin: [36.45, 81.55], size: [94.35, 122.45] },
  124: { origin: [99.65, 68.4], size: [199.3, 170.3] },
  125: { origin: [72.0, 101.2], size: [158.0, 153.55] },
  126: { origin: [83.35, 36.9], size: [166.5, 127.85] },
  127: { origin: [65.5, 90.9], size: [146.0, 140.0] },
  128: { origin: [99.65, 57.85], size: [199.3, 165.35] },
  129: { origin: [72.65, 107.5], size: [157.1, 160.0] },
  130: { origin: [72.1, 56.55], size: [144.2, 140.6] },
  132: { origin: [100.0, 70.0], size: [200.0, 170.35] },
  134: { origin: [82.4, 29.7], size: [164.45, 121.4] },
  136: { origin: [101.25, 52.7], size: [202.5, 159.2] },
};

/**
 * One snowcat direction: the never-animated `upper` shape plus the two `lower`
 * (underside) poses that alternate while walking. `mirror` flips the pair
 * horizontally, which is how the SWF draws `dir` 6-8 (it reuses these shapes
 * with a negated `scaleX`).
 */
export interface SnowcatPose {
  readonly upper: number;
  readonly lower: readonly [number, number];
  readonly mirror: boolean;
}

/**
 * Direction index (0 = N, 2 = E, 4 = S, 6 = W) to shapes. The SWF numbers its
 * directions the same way from 1 (frame `dir + 10`), so client `d` is SWF `d + 1`
 * here: idle sprites 11-18 are `DefineSprite_138` frames 11-18. The SWF draws the
 * westerly directions by mirroring the easterly ones (frames 16/17/18 repeat
 * 14/13/12 with `scaleX = -1`).
 */
export const SNOWCAT_POSES: readonly SnowcatPose[] = [
  { upper: 123, lower: [122, 130], mirror: false }, // 0 N  (frame 11)
  { upper: 125, lower: [124, 132], mirror: false }, // 1 NE (frame 12)
  { upper: 127, lower: [126, 134], mirror: false }, // 2 E  (frame 13)
  { upper: 129, lower: [128, 136], mirror: false }, // 3 SE (frame 14)
  { upper: 119, lower: [118, 120], mirror: false }, // 4 S  (frame 15)
  { upper: 129, lower: [128, 136], mirror: true }, //  5 SW (frame 18)
  { upper: 127, lower: [126, 134], mirror: true }, //  6 W  (frame 17)
  { upper: 125, lower: [124, 132], mirror: true }, //  7 NW (frame 16)
];

/* Speech balloon ----------------------------------------------------------- */

export const BALLOON_FILL = 0x003399; // 13209
export const BALLOON_FONT_SIZE = 12;
export const BALLOON_LINE_HEIGHT = 47 / 4; // 11.75
export const BALLOON_WRAP_WIDTH = 146;
/** Bubble offset: 46px above the head plus half the line height. */
export const BALLOON_OFFSET_Y = -46 - 47 / 2;
/** Seconds a speech balloon stays visible. */
export const BALLOON_HOLD_SECONDS = 8;

/* Extended variant ---------------------------------------------------------- */

/** SWF-faithful extended client: name labels, hover help, red hover, pop audio. */
export const EXTENDED = true;

/* Rooms / pre-join setup (extended) ----------------------------------------- */

/** Fallback nickname used when the name field is left blank. */
export const DEFAULT_NICKNAME = "Guest";
/** SWF name field `maxLength="14"`. */
export const MAX_NICKNAME_LENGTH = 14;

/** A selectable room: the server-resolved `id` plus its display `name`. */
export interface RoomOption {
  readonly id: string;
  readonly name: string;
}

/** The three rooms offered on the pre-join screen (server-resolved ids). */
export const ROOMS: readonly RoomOption[] = [
  { id: "penguin1", name: "Snow Room" },
  { id: "northpole", name: "North Pole" },
  { id: "crashsite", name: "Crash Site" },
];

/** Room joined when the user does not pick one (Snow Room, the default). */
export const DEFAULT_ROOM_ID = "penguin1";

/**
 * Two-line "Please enter a name / for your penguin?" prompt, centred on the
 * canvas (the SWF text sits at the same spot with its lines centre-aligned).
 */
export const SETUP_PROMPT_TEXT = "Please enter a name\nfor your penguin?";
export const SETUP_PROMPT_POS = { x: 300, y: 230 } as const;
export const SETUP_PROMPT_FONT_SIZE = 13;
export const SETUP_PROMPT_LINE_HEIGHT = 13.3;
export const SETUP_INPUT_POS = { x: 215, y: 267 } as const;
export const SETUP_INPUT_WIDTH = 170;
export const SETUP_INPUT_HEIGHT = 22;
/** Room radio group: circle-centre x and first row centre y. */
export const SETUP_RADIO_X = 420;
export const SETUP_RADIO_FIRST_Y = 245;
/** "Next" button, sitting a little below the name field. */
export const SETUP_NEXT_BUTTON_POS = { x: 300, y: 315 } as const;

/* Radio buttons (`RadioButton`, extended) ----------------------------------- */

/** SWF room-selector circle: 12.8px diameter, `#ffffff` idle, `#febb00` selected. */
export const RADIO_RADIUS = 6.4;
export const RADIO_FILL = 0xffffff;
export const RADIO_SELECTED_FILL = 0xfebb00;
export const RADIO_STROKE = 0x000000;
export const RADIO_STROKE_WIDTH = 1;
export const RADIO_LABEL_GAP = 10;
export const RADIO_LABEL_COLOR = 0x000000;
export const RADIO_LABEL_FONT_SIZE = 11;
/** Vertical spacing between radio rows (SWF: 16px). */
export const RADIO_ROW_GAP = 16;

/* Room backgrounds (extended) ----------------------------------------------- */

/**
 * World position of the northpole shape's local origin. The SVG wraps its art
 * in a `(10.05, 10.4)` translate, so the sprite is offset by that amount.
 */
export const NORTHPOLE_ORIGIN = { x: 388.3, y: 153.8 } as const;
export const NORTHPOLE_SVG_OFFSET = { x: 10.05, y: 10.4 } as const;

/** Crash-site wave two-frame bob: center positions and per-phase duration (s). */
export const WAVE_FRAME_A = { x: 87.75, y: 341.15 } as const;
export const WAVE_FRAME_B = { x: 86.95, y: 341.95 } as const;
export const WAVE_BOB_SECONDS = 1.0; // 20 frames @ 20fps

/* Penguin name label (`Penguin`, extended) --------------------------------- */

/** Name label under each penguin: black Arial 10px, centered (SWF `name` field). */
export const NAME_TEXT_COLOR = 0x000000;
export const NAME_TEXT_FONT_SIZE = 10;
/** SWF `name` offset: 514 twips below the character origin, less a 40 twip inset. */
export const NAME_TEXT_OFFSET_Y = 16;

/* Hover help text (`World`, extended) -------------------------------------- */

/** Help label: gray Arial 10px (SWF `help1`/`help2` fields). */
export const HELP_TEXT_COLOR = 0x666666;
export const HELP_TEXT_FONT_SIZE = 10;
/** SWF help field top edge: 7165 twips less a 40 twip inset. */
export const HELP_TEXT_TOP = 356;
/** SWF `help1` left edge: 5844 twips less a 40 twip inset. */
export const HELP_TEXT_LEFT = 290;
/** SWF `help2` right edge: 8444 twips plus its 2557 twip width. */
export const HELP_TEXT_RIGHT = 550;

/* Icon buttons (`IconButton`, extended) ------------------------------------ */

/** Hover fill for the toolbar buttons: SWF over-state shape `#ff0000`. */
export const ICON_HOVER_FILL_EXTENDED = 0xff0000;

/* Audio (extended) --------------------------------------------------------- */

/** SWF sound 111; played when a penguin enters or leaves the world. */
export const ASSET_POP_SOUND = "sounds/111.wav";

/* Assets ------------------------------------------------------------------- */

export const ASSET_SHEET = "assets/penguin/penguin.json";
export const ASSET_TITLE = [
  "images/title@1x.png",
  "images/title@2x.png",
  "images/title@4x.png",
];
export const ASSET_LOADING = [
  "images/loading@1x.png",
  "images/loading@2x.png",
  "images/loading@4x.png",
];
export const ASSET_ROCKETSNAIL = [
  "images/rocketsnail@1x.png",
  "images/rocketsnail@2x.png",
  "images/rocketsnail@4x.png",
];

/** SVG room art served from `public/assets/rooms/`. */
export const ASSET_ROOM_NORTHPOLE = "assets/rooms/northpole.svg";
export const ASSET_ROOM_CRASHED_BOBCAT = "assets/rooms/crashedbobcat.svg";
export const ASSET_ROOM_WAVE = "assets/rooms/wave.svg";
export const ASSET_ROOM_BOBCAT_LAYER2 = "assets/rooms/bobcatlayer2.svg";

/** Icon sprite sources, keyed by the alias suffix used at load time. */
export const ICON_SOURCES: Record<string, [string, string, string]> = {
  send: [
    "icons/icon_send@1x.png",
    "icons/icon_send@2x.png",
    "icons/icon_send@4x.png",
  ],
  log: [
    "icons/icon_log@1x.png",
    "icons/icon_log@2x.png",
    "icons/icon_log@4x.png",
  ],
  res: [
    "icons/icon_res@1x.png",
    "icons/icon_res@2x.png",
    "icons/icon_res@4x.png",
  ],
  disconnect: [
    "icons/icon_disconnect@1x.png",
    "icons/icon_disconnect@2x.png",
    "icons/icon_disconnect@4x.png",
  ],
};
