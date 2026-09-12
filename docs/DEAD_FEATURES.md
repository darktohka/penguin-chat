# Dead Features

The archived client contains protocol surface and assets that are shipped but
**unreachable**. This file records them so nobody mistakes the absence of an
in-game emote button, for example, for a server bug - and so the server's
handling of these messages is understood as deliberate protocol parity rather
than dead code.

Findings were derived by tracing call sites and event subscriptions in the
original minified bundle, now decompiled under `client/src`. "0 call sites" means
the method is defined but never invoked anywhere in the client.

## Protocol surface the client can never send

| Message   | Status           | Evidence                                                                                     |
| --------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `emote`   | Dead             | `GameClient.emote()` has **0 call sites**; no button, key, or gesture emits it               |
| `trigger` | Dead             | `GameClient.trigger()` has **0 call sites**                                                  |
| `verify`  | Dead in practice | `GameClient.verify()` has **0 call sites**; the boot sequence always calls `guest()` instead |

There is no emote UI. The toolbar builds exactly three buttons, and none of them
send these messages:

| Button       | Action                     |
| ------------ | -------------------------- |
| `send`       | `this.sendChat()`          |
| `log`        | toggle chat log visibility |
| `disconnect` | `this.onDisconnect?.()`    |

Input is limited to `pointerdown` on the canvas (→ `move`) and `keydown` for
`Enter` only (→ focus/send chat).

## Protocol surface the client receives but never handles

These arrive from the server and are parsed by the transport, but the internal
event they emit has **0 subscribers**, so nothing is rendered:

| Message              | Internal event  | Subscribers |
| -------------------- | --------------- | ----------- |
| `E` (emote)          | `emote`         | 0           |
| `P` (play animation) | `playAnimation` | 0           |

The world component (`oc`) subscribes only to:

```
playerAdded, playerRemoved, playerMoved, chat, info, message
```

## Shipped but unused assets

| Asset                                 | Status                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `icons/icon_res@1x.png`, `@2x`, `@4x` | Declared in the icon asset map and downloaded, but no button references `res`. Only `send`, `log`, and `disconnect` are used. |

## Not dead (looks unreachable to a naive grep)

- `loggedIn` / `joined` - subscribed dynamically through the helper
  `fc(socket, 'loggedIn')` / `fc(socket, 'joined')` in the boot sequence, not via
  a literal `.on('loggedIn')`. They are on the critical path.
- `connected` - emitted with no subscriber, but purely informational; harmless.

## Why the server still implements the dead messages

This is an archival project, so the server keeps full protocol parity (see
[PROTOCOL.md](PROTOCOL.md)):

- A bot or hand-crafted WebSocket client can send `emote`, `trigger`, or
  `verify` directly to `/ws` even though the browser UI cannot.
- The server enforces the same advertised limits on them
  (`emote` max length 20 / cooldown 5000 ms), so behavior stays consistent.
- Removing them would make the archive diverge from the original wire protocol
  for no benefit.

In short: the emote and trigger handlers are correct and intentional; they are
simply never exercised by the browser client.
