/* Application / world geometry -------------------------------------------- */

/** Pixi canvas width and height; the world is a fixed 600x400 stage. */
export const GAME_WIDTH = 600;
export const GAME_HEIGHT = 400;

/** Room id used for both the `game` field and the `join` request. */
export const GAME_ID = "penguin1";
export const ROOM_ID = "penguin1";

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
export const DISCONNECT_BUTTON_POS = { x: 560, y: TOOLBAR_Y } as const;

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
