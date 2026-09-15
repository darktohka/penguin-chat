# Penguin Chat WebSocket Protocol

This document describes the wire protocol used between the Penguin Chat
browser client (source in `client/`) and the Rust server. It is a reverse-engineered
description of the original `wss://snowball.rocketsnail.com` protocol; this
server reimplements it so the client can be self-hosted unchanged apart from the
socket URL.

## Transport

- **Endpoint:** `GET /ws` (WebSocket upgrade).
- **Framing:** one JSON object per WebSocket **text** frame. No binary frames.
- **Origin:** same-origin. The client resolves the URL as
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`, so
  the server does not need to terminate TLS itself (put it behind a reverse
  proxy for HTTPS).
- **Encoding:** UTF-8 JSON. Unknown fields are ignored; unknown `type` values are
  logged and dropped without closing the connection.
- **World:** three rooms sharing a single 600×400 coordinate space, each with its
  own independent player set (see [Rooms](#rooms)). Coordinates are clamped
  server-side to `x ∈ [0, 600]`, `y ∈ [0, 400]`.

Message direction is indicated per message. All server→client frames include a
`type` discriminator. Short one-letter types (`A`, `R`, `X`, `C`, `E`, `P`) are
used for the high-frequency in-room events.

## Rooms

Players are grouped into rooms. A room is chosen with the optional `room` field
of the `join` request; each room keeps its own player set and its own broadcast
scope, so a player only ever sees `A`/`R`/`X`/`C`/`E`/`P` frames from players in
the same room.

| Room id     | Display name | Notes                                   |
| ----------- | ------------ | --------------------------------------- |
| `penguin1`  | Snow Room    | Default / first room (used by old clients) |
| `northpole` | North Pole   |                                         |
| `crashsite` | Crash Site   |                                         |

A `join` request with no `room` field, or with a room id the server does not
recognise, is placed in the first (default) room, `penguin1`. This keeps old
clients that only ever send `"room": "penguin1"` working unchanged.

## Server → Client

### `login` - identity assigned

Sent immediately in response to the first `guest` (or `verify`) message.

```json
{
  "type": "login",
  "data": {
    "id": "p1",
    "username": "p1",
    "nickname": "Tux",
    "critter": { "nickname": "Tux" },
    "roles": [],
    "limits": {
      "move": { "minDistance": 4, "cooldown": 0 },
      "chat": { "maxLength": 60, "cooldown": 500 },
      "emote": { "maxLength": 60, "cooldown": 500 }
    }
  }
}
```

- `data.id` - stable per-connection player id (e.g. `p1`, `p2`).
- `data.username` - the player id (this server has no accounts).
- `data.nickname` / `data.critter.nickname` - the display nickname chosen at
  login (`"Guest"` when none was supplied). At most 14 characters.
- `data.roles` - role metadata.
- `data.limits` - client-side rate limits. `limits.move.minDistance` is the
  minimum pointer travel before a move is sent; `limits.chat.maxLength` and
  `limits.emote.maxLength` cap message length; `cooldown` is in milliseconds.

> The client treats a `login` as the handshake success and waits for it before
> sending `join`. It rejects the connection on an `error` frame, so `login` is
> always used for the normal path.

### `join` - room state snapshot

Sent once after the client's `join` request.

```json
{
  "type": "join",
  "data": {
    "type": "penguin1",
    "id": "p1",
    "players": [
      {
        "id": "p1",
        "nickname": "Tux",
        "x": 350,
        "y": 289,
        "critter": { "nickname": "Tux" }
      }
    ],
    "navmesh": null,
    "triggers": [],
    "props": [],
    "margin": 0
  }
}
```

- `data.type` is the **resolved** room id (see [Rooms](#rooms)). A request for an
  unknown room resolves to `penguin1`.
- `data.players` **includes the joining player itself.** The client renders its
  own penguin solely by iterating this array (`for (const p of data.players)
addPlayer(...)`) and never adds the local player separately; omitting self
  means the local sprite never appears. Each entry's `nickname` is that player's
  chosen display name.
- `data.navmesh`, `data.triggers`, `data.props` are world metadata (unused in the
  flat `penguin1` room; `navmesh` is `null`).
- `data.margin` is the pointer-safe margin for movement input.

### `A` - player added

Broadcast to everyone **except** the joiner when a player enters the room.

```json
{
  "type": "A",
  "i": "p2",
  "n": "Tux",
  "x": 248,
  "y": 351,
  "c": { "t": "penguin1", "o": {} }
}
```

| Field    | Meaning                                                |
| -------- | ------------------------------------------------------ |
| `i`      | player id                                              |
| `n`      | nickname                                               |
| `x`, `y` | spawn position                                         |
| `c`      | critter descriptor `{ t: type, o: outfit }` (optional) |

### `R` - player removed

Broadcast to the remaining players when someone leaves.

```json
{ "type": "R", "i": "p2" }
```

### `X` - player moved

Broadcast to everyone **including the sender** whenever a player moves. The
client is server-authoritative: the local sprite only moves when it receives its
own `X` echo, so a server that excludes the sender would freeze local movement.

```json
{ "type": "X", "i": "p2", "x": 123, "y": 234 }
```

### `C` - chat message

Broadcast to everyone **including the sender**. The client suppresses
re-displaying its own local line by comparing `i` with its own player id.

```json
{ "type": "C", "i": "p2", "m": "hello from B" }
```

### `E` - emote

Broadcast to everyone including the sender.

```json
{ "type": "E", "i": "p2", "e": "wave" }
```

### `P` - play animation

Broadcast to the room; used for triggered animation frames.

```json
{ "type": "P", "t": "p2", "f": 0 }
```

| Field | Meaning            |
| ----- | ------------------ |
| `t`   | target (player id) |
| `f`   | frame index        |

### `info` / `message` / `warn` / `error` / `log`

Out-of-band text channels rendered into the client's chat log. `message` has
`{ style, title, text, console }`; `info`/`log` have `{ message }`; `error`/`warn`
have `{ code, message }` and additionally fail the connection handshake.

```json
{ "type": "info", "message": "guest login is used for this server" }
```

## Client → Server

### `guest` - anonymous login

```json
{ "type": "guest", "game": "penguin1" }
```

An optional `nickname` field may be supplied. The server replies with `login`.
The nickname is trimmed, stripped of control characters and capped at 14
characters; an absent, empty or all-whitespace nickname becomes `"Guest"`.
Nicknames are not unique.

### `verify` - token login

```json
{ "type": "verify", "token": "<token>", "game": "penguin1" }
```

This server has no accounts; `verify` is accepted and falls back to guest access,
preceded by an `info` frame.

### `join` - enter the room

```json
{ "type": "join", "room": "penguin1" }
```

The server registers the player, replies with the `join` snapshot, and announces
the player to others with `A`. A player who logs in but never sends `join` stays
out of the room and is invisible to others. The `room` field selects the room
(see [Rooms](#rooms)); omitting it - or naming an unknown room - joins the
default room, `penguin1`. All subsequent broadcasts are scoped to that room.

### `move`

```json
{ "type": "move", "x": 123, "y": 234 }
```

Coordinates are clamped to the world bounds and broadcast as `X` to the whole
room, including the sender.

### `chat`

```json
{ "type": "chat", "message": "hello" }
```

Messages are truncated to 60 characters and broadcast as `C`.

### `emote`

```json
{ "type": "emote", "emote": "wave" }
```

Emotes are truncated to 60 characters and broadcast as `E`.

### `trigger`

```json
{ "type": "trigger" }
```

Broadcast as `P` targeting the sender.

## Connection Lifecycle

```
client                          server
  |── guest ───────────────────▶|
  |◀──────────────── login ─────|
  |── join ────────────────────▶|
  |◀──────────────── join ──────|  (players includes self)
  |                             |── A ──▶ others in room
  |── move ────────────────────▶|── X ──▶ all in room (including sender)
  |── chat ────────────────────▶|── C ──▶ all in room (including sender)
  |── emote ───────────────────▶|── E ──▶ all in room (including sender)
  |   (disconnect)              |── R ──▶ others in room
```

Ordering guarantees and rules:

- `login` is always sent before any `join` snapshot on the same connection.
- A `join` snapshot lists players already in the room **and** the joiner.
- Every room-scoped frame (`A`, `R`, `X`, `C`, `E`, `P`) only reaches players in
  the sender's room.
- A player is only added to the room on `join`, and only removed on disconnect
  if they had joined.
- `chat`, `emote`, `move`, and `trigger` are ignored until the player has joined.
- Malformed or non-JSON frames are logged and skipped; the connection is kept
  open.
- The server does not originate `verify` flows, authentication, or persistence;
  all state is in memory and resets when the process stops.
