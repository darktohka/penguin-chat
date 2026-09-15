/** A critter descriptor as sent in `join` snapshots and `A` frames. */
export interface CritterDescriptor {
  /** Critter type, e.g. `penguin1` (wire form). */
  t?: string;
  /** Outfit/options object, empty for the archived room (wire form). */
  o?: Record<string, unknown>;
  /** Normalized critter type, as decoded by the client. */
  type?: string;
  /** Normalized outfit, as decoded by the client. */
  outfit?: Record<string, unknown>;
  /** Critter nickname from a `join` snapshot. */
  nickname?: string;
  [key: string]: unknown;
}

/** A player entry inside a `join` snapshot. */
export interface PlayerSnapshot {
  id: string;
  nickname?: string;
  username?: string;
  x: number;
  y: number;
  critter?: { nickname?: string } & CritterDescriptor;
}

/** Server-assigned per-connection limits. */
export interface Limits {
  move: { minDistance: number; cooldown: number };
  chat: { maxLength: number; cooldown: number };
  emote: { maxLength: number; cooldown: number };
  join: { cooldown: number };
}

/** `login` - identity assigned, sent in response to the first `guest`/`verify`. */
export interface LoginFrame {
  type: "login";
  data: {
    id: string;
    critter: { nickname?: string } & CritterDescriptor;
    roles: string[];
    limits: Limits;
  };
}

/** `join` - room state snapshot, includes the joining player itself. */
export interface JoinFrame {
  type: "join";
  data: {
    /** Room id, e.g. `penguin1`. */
    type: string;
    id: string;
    players: PlayerSnapshot[];
    navmesh: unknown | null;
    triggers: unknown[];
    props: unknown[];
    /** Pointer-safe margin for movement input. */
    margin?: number;
  };
}

/** `A` - player added (broadcast to everyone except the joiner). */
export interface PlayerAddedFrame {
  type: "A";
  i: string;
  n?: string;
  u?: string;
  x: number;
  y: number;
  c?: CritterDescriptor;
}

/** `R` - player removed. */
export interface PlayerRemovedFrame {
  type: "R";
  i: string;
}

/** `X` - player moved (broadcast to all, including the sender). */
export interface PlayerMovedFrame {
  type: "X";
  i: string;
  x: number;
  y: number;
}

/** `C` - chat message (broadcast to all, including the sender). */
export interface ChatFrame {
  type: "C";
  i: string;
  m: string;
}

/** `E` - emote (broadcast to all, including the sender). */
export interface EmoteFrame {
  type: "E";
  i: string;
  e: string;
}

/** `P` - play animation. */
export interface PlayAnimationFrame {
  type: "P";
  t: string;
  f: number;
}

/** Out-of-band text channels rendered into the client's chat log. */
export interface InfoFrame {
  type: "info" | "log";
  message: string;
}

export interface MessageFrame {
  type: "message";
  style?: string;
  title?: string;
  text?: string;
  console?: boolean;
}

export interface ErrorFrame {
  type: "error" | "warn";
  code?: string;
  message?: string;
}

/** Any frame a server may send. Unknown types are logged and dropped. */
export type ServerFrame =
  | LoginFrame
  | JoinFrame
  | PlayerAddedFrame
  | PlayerRemovedFrame
  | PlayerMovedFrame
  | ChatFrame
  | EmoteFrame
  | PlayAnimationFrame
  | InfoFrame
  | MessageFrame
  | ErrorFrame;

/** A loose frame as received before it is interpreted. */
export interface RawFrame {
  type: string;
  [key: string]: unknown;
}

/* Client -> Server frames -------------------------------------------------- */

export interface GuestFrame {
  type: "guest";
  nickname?: string;
  game?: string;
}

export interface VerifyFrame {
  type: "verify";
  token: string;
  game?: string;
}

export interface JoinRequestFrame {
  type: "join";
  room: string;
}

export interface MoveFrame {
  type: "move";
  x: number;
  y: number;
}

export interface ChatRequestFrame {
  type: "chat";
  message: string;
}

export interface EmoteRequestFrame {
  type: "emote";
  emote: string;
}

export interface TriggerFrame {
  type: "trigger";
}

export type ClientFrame =
  | GuestFrame
  | VerifyFrame
  | JoinRequestFrame
  | MoveFrame
  | ChatRequestFrame
  | EmoteRequestFrame
  | TriggerFrame;
