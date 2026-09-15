//! WebSocket game hub and the Penguin Chat wire protocol.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::AppState;

static NEXT_CONNECTION: AtomicU64 = AtomicU64::new(1);
static NEXT_PLAYER: AtomicU64 = AtomicU64::new(1);

const ROOM: &str = "penguin1";
const WORLD_WIDTH: f64 = 600.0;
const WORLD_HEIGHT: f64 = 400.0;

const ROLE_GUEST: &str = "guest";
const CRITTER_TYPE: &str = "default";

/// Guest nickname assigned to every anonymous player, as the original does.
const NICKNAME: &str = "Guest";

/// Extended server variant: include a top-level `nickname` in room snapshots so
/// the client can label penguins without reading `critter.nickname`.
const EXTENDED: bool = true;

/// Chat/emote length caps are measured in UTF-16 code units, matching the
/// client's JavaScript `String.length`, so the advertised limits line up exactly.
const MAX_CHAT: usize = 60;
const MAX_EMOTE: usize = 20;

/// Movement/chat limits mirror the original server's `login.limits` payload.
const MIN_MOVE_DISTANCE: f64 = 10.0;
const MOVE_SPEED: u32 = 200;
const MOVE_COOLDOWN: Duration = Duration::from_millis(500);
const CHAT_COOLDOWN: Duration = Duration::from_millis(5000);
const EMOTE_COOLDOWN: Duration = Duration::from_millis(5000);

/// Absorbs scheduling/network jitter so a client that respects its own cooldown
/// is never dropped by the server's slightly later arrival timestamp.
const COOLDOWN_TOLERANCE: Duration = Duration::from_millis(50);

/// Hard cap on a single WebSocket frame; the largest legitimate frame is a JSON
/// chat message, so this bounds memory use against oversized-frame abuse.
const MAX_FRAME_BYTES: usize = 8 * 1024;

/// Per-connection outbound queue depth. Bounded so one client that stops reading
/// cannot make the server buffer its backlog without limit; when full, further
/// messages are dropped rather than growing memory.
const OUTBOUND_QUEUE: usize = 256;

/// Walkable outline for the single `penguin1` room, inset from the world bounds.
const NAVMESH_PATH: [f64; 8] = [10.0, 10.0, 590.0, 10.0, 590.0, 390.0, 10.0, 390.0];

/// Pointer clamp margin the client applies around the world edge.
const ROOM_MARGIN: u32 = 20;

/// Spawn point every penguin starts at, matching the original room's `start`.
const SPAWN_X: f64 = 300.0;
const SPAWN_Y: f64 = 210.0;

/// Critter descriptor sent inside player payloads.
#[derive(Clone, Serialize)]
pub struct Critter {
    pub nickname: String,
    #[serde(rename = "type")]
    pub critter_type: &'static str,
    pub outfit: Value,
}

impl Critter {
    fn guest(nickname: &str) -> Self {
        Self {
            nickname: nickname.to_owned(),
            critter_type: CRITTER_TYPE,
            outfit: Value::Object(serde_json::Map::new()),
        }
    }
}

/// One player as seen by a joining client.
#[derive(Clone, Serialize)]
pub struct PlayerSnapshot {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    pub x: f64,
    pub y: f64,
    pub critter: Critter,
}

/// A registered player held by the hub.
struct Player {
    x: f64,
    y: f64,
    tx: mpsc::Sender<Message>,
}

/// Single global room holding every connected player.
pub struct Hub {
    players: Mutex<HashMap<String, Player>>,
}

impl Hub {
    pub fn new() -> Self {
        Self {
            players: Mutex::new(HashMap::new()),
        }
    }

    /// Lock the player map, recovering from a poisoned lock rather than panicking.
    fn players(&self) -> MutexGuard<'_, HashMap<String, Player>> {
        self.players.lock().unwrap_or_else(|poison| poison.into_inner())
    }

    fn insert(&self, id: String, x: f64, y: f64, tx: mpsc::Sender<Message>) {
        self.players().insert(id, Player { x, y, tx });
    }

    fn remove(&self, id: &str) -> bool {
        self.players().remove(id).is_some()
    }

    /// Snapshots of every player in the room, including the joiner itself.
    ///
    /// The client renders its own penguin solely from the `join` payload's
    /// `players` array (it never adds the local player separately), so the
    /// joiner must be present here or the local sprite would never appear.
    fn room_players(&self) -> Vec<PlayerSnapshot> {
        self.players()
            .iter()
            .map(|(id, player)| PlayerSnapshot {
                id: id.clone(),
                nickname: EXTENDED.then(|| NICKNAME.to_owned()),
                x: player.x,
                y: player.y,
                critter: Critter::guest(NICKNAME),
            })
            .collect()
    }

    /// Outbound channels of everyone except `id`.
    fn channels_except(&self, id: &str) -> Vec<mpsc::Sender<Message>> {
        self.players()
            .iter()
            .filter(|(other, _)| other.as_str() != id)
            .map(|(_, player)| player.tx.clone())
            .collect()
    }

    /// Outbound channels of everyone including `id`.
    fn channels_all(&self) -> Vec<mpsc::Sender<Message>> {
        self.players().values().map(|player| player.tx.clone()).collect()
    }

    /// Persist a validated position; returns whether the player exists.
    fn set_position(&self, id: &str, x: f64, y: f64) -> bool {
        match self.players().get_mut(id) {
            Some(player) => {
                player.x = x;
                player.y = y;
                true
            }
            None => false,
        }
    }
}

/// Client identity captured at the HTTP upgrade, before the WebSocket handshake
/// completes. Used for login audit logging.
struct ClientInfo {
    ip: String,
    user_agent: Option<String>,
}

impl ClientInfo {
    /// Resolve the client IP honoring proxy headers, then the `User-Agent`.
    ///
    /// The peer address is only a fallback: behind a reverse proxy it is the
    /// proxy's address, so the forwarded headers take precedence.
    fn from_headers(headers: &HeaderMap, peer: Option<SocketAddr>) -> Self {
        let ip = forwarded_ip(headers).unwrap_or_else(|| {
            peer.map(|addr| addr.ip().to_string())
                .unwrap_or_else(|| "unknown".to_owned())
        });
        let user_agent = headers
            .get(header::USER_AGENT)
            .and_then(|value| value.to_str().ok())
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
        Self { ip, user_agent }
    }
}

/// Resolve the originating client IP from the headers a reverse proxy sets.
///
/// `X-Forwarded-For` is a comma-separated chain; its first (left-most) entry is
/// the original client, with later entries appended by each proxy hop. Falls
/// back to `X-Real-IP` when absent.
fn forwarded_ip(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        })
}

/// A single WebSocket connection and its state machine.
struct Connection {
    conn: String,
    client: ClientInfo,
    hub: Arc<Hub>,
    tx: mpsc::Sender<Message>,
    player_id: Option<String>,
    x: f64,
    y: f64,
    joined: bool,
    warned_malformed: bool,
    last_chat: Option<Instant>,
    last_emote: Option<Instant>,
}

impl Connection {
    /// Dispatch one inbound JSON frame. Never returns an error: malformed frames
    /// are logged and the connection stays open.
    fn handle_text(&mut self, text: &str) {
        let value: Value = match serde_json::from_str(text) {
            Ok(value) => value,
            Err(err) => {
                if self.warned_malformed {
                    tracing::debug!(connection = %self.conn, error = %err, "malformed websocket frame");
                } else {
                    self.warned_malformed = true;
                    tracing::warn!(connection = %self.conn, error = %err, "malformed websocket frame");
                }
                return;
            }
        };
        match value.get("type").and_then(Value::as_str) {
            Some("guest") | Some("verify") => self.handle_login(&value),
            Some("join") => self.handle_join(),
            Some("move") => self.handle_move(&value),
            Some("chat") => self.handle_chat(&value),
            Some("emote") => self.handle_emote(&value),
            Some("trigger") => self.handle_trigger(),
            Some(other) => {
                tracing::warn!(connection = %self.conn, kind = other, "unknown message type");
            }
            None => {
                tracing::warn!(connection = %self.conn, "message without a type field");
            }
        }
    }

    /// Enforces the cooldown advertised for `action`; returns `false` if the
    /// client is still within it. A client that honours its own cooldown is
    /// always allowed through via `COOLDOWN_TOLERANCE`.
    fn cooldown_elapsed(last: &mut Option<Instant>, cooldown: Duration) -> bool {
        let now = Instant::now();
        match *last {
            Some(previous) if now.duration_since(previous) + COOLDOWN_TOLERANCE < cooldown => false,
            _ => {
                *last = Some(now);
                true
            }
        }
    }

    /// `guest` / `verify`: assign identity, send an optional notice, then `login`.
    fn handle_login(&mut self, value: &Value) {
        if value.get("type").and_then(Value::as_str) == Some("verify") {
            self.send(json!({
                "type": "info",
                "message": "guest login is used for this server",
            }));
        }

        let id = self.player_id.get_or_insert_with(new_player_id).clone();
        let (x, y) = random_spawn();
        self.x = x;
        self.y = y;

        self.send(json!({
            "type": "login",
            "data": {
                "id": id,
                "username": id,
                "nickname": NICKNAME,
                "critter": Critter::guest(NICKNAME),
                "roles": [ROLE_GUEST],
                "limits": {
                    "move": {
                        "minDistance": MIN_MOVE_DISTANCE,
                        "speed": MOVE_SPEED,
                        "cooldown": MOVE_COOLDOWN.as_millis() as u64,
                    },
                    "chat": { "maxLength": MAX_CHAT, "cooldown": CHAT_COOLDOWN.as_millis() as u64 },
                    "emote": { "maxLength": MAX_EMOTE, "cooldown": EMOTE_COOLDOWN.as_millis() as u64 },
                },
            },
        }));
        tracing::info!(
            connection = %self.conn,
            player = %id,
            nickname = NICKNAME,
            room = ROOM,
            ip = %self.client.ip,
            user_agent = self.client.user_agent.as_deref().unwrap_or("-"),
            "penguin logged in"
        );
    }

    /// `join`: register in the hub, deliver the room state, announce to others.
    fn handle_join(&mut self) {
        let Some(id) = self.player_id.clone() else {
            tracing::warn!(connection = %self.conn, "join before login ignored");
            return;
        };

        self.hub.insert(id.clone(), self.x, self.y, self.tx.clone());
        self.joined = true;

        let players = self.hub.room_players();
        self.send(json!({
            "type": "join",
            "data": {
                "type": ROOM,
                "id": id,
                "players": players,
                "width": WORLD_WIDTH,
                "height": WORLD_HEIGHT,
                "margin": ROOM_MARGIN,
                "navmesh": { "path": NAVMESH_PATH },
                "start": { "x": self.x, "y": self.y },
                "triggers": [],
                "props": [],
            },
        }));

        let announcement = json!({
            "type": "A",
            "i": id,
            "n": NICKNAME,
            "x": self.x,
            "y": self.y,
            "c": { "t": CRITTER_TYPE, "o": {} },
        });
        broadcast(&self.hub.channels_except(&id), announcement);

        tracing::info!(player = %id, nickname = NICKNAME, room = ROOM, "penguin joined");
    }

    /// `move`: enforce `minDistance`, clamp to the world, then echo `X` to all.
    fn handle_move(&mut self, value: &Value) {
        let (Some(x), Some(y)) = (value.get("x").and_then(Value::as_f64), value.get("y").and_then(Value::as_f64)) else {
            tracing::warn!(connection = %self.conn, "move with invalid coordinates");
            return;
        };

        if !x.is_finite() || !y.is_finite() {
            tracing::warn!(connection = %self.conn, "move with non-finite coordinates");
            return;
        }
        let x = x.clamp(0.0, WORLD_WIDTH);
        let y = y.clamp(0.0, WORLD_HEIGHT);

        let Some(id) = self.player_id.clone() else { return };

        if !self.joined {
            return;
        }

        let distance = (x - self.x).hypot(y - self.y);

        if distance < MIN_MOVE_DISTANCE {
            tracing::debug!(player = %id, distance, "move ignored: below minDistance");
            return;
        }

        self.x = x;
        self.y = y;

        if !self.hub.set_position(&id, x, y) {
            return;
        }

        tracing::debug!(player = %id, x, y, "move");
        let payload = json!({ "type": "X", "i": id, "x": x, "y": y });
        broadcast(&self.hub.channels_all(), payload);
    }

    /// `chat`: enforce length and cooldown, then echo `C` to the whole room.
    fn handle_chat(&mut self, value: &Value) {
        let Some(message) = value.get("message").and_then(Value::as_str) else {
            tracing::warn!(connection = %self.conn, "chat with missing message");
            return;
        };

        let Some(id) = self.player_id.clone() else { return };

        if !self.joined {
            return;
        }

        if utf16_len(message) > MAX_CHAT {
            tracing::warn!(player = %id, "chat ignored: exceeds maxLength");
            return;
        }

        if !Self::cooldown_elapsed(&mut self.last_chat, CHAT_COOLDOWN) {
            tracing::debug!(player = %id, "chat ignored: cooldown");
            return;
        }

        tracing::info!(player = %id, nickname = NICKNAME, message = %message, "chat");
        let payload = json!({ "type": "C", "i": id, "m": message });
        broadcast(&self.hub.channels_all(), payload);
    }

    /// `emote`: enforce length and cooldown, then echo `E` to the whole room.
    fn handle_emote(&mut self, value: &Value) {
        let Some(emote) = value.get("emote").and_then(Value::as_str) else {
            tracing::warn!(connection = %self.conn, "emote with missing emote");
            return;
        };

        let Some(id) = self.player_id.clone() else { return };

        if !self.joined {
            return;
        }

        if utf16_len(emote) > MAX_EMOTE {
            tracing::warn!(player = %id, "emote ignored: exceeds maxLength");
            return;
        }

        if !Self::cooldown_elapsed(&mut self.last_emote, EMOTE_COOLDOWN) {
            tracing::debug!(player = %id, "emote ignored: cooldown");
            return;
        }

        tracing::info!(player = %id, nickname = NICKNAME, emote = %emote, "emote");
        let payload = json!({ "type": "E", "i": id, "e": emote });
        broadcast(&self.hub.channels_all(), payload);
    }

    /// `trigger`: emit a room-wide animation frame.
    fn handle_trigger(&mut self) {
        let Some(id) = self.player_id.clone() else { return };

        if !self.joined {
            return;
        }

        tracing::debug!(player = %id, "trigger");
        let payload = json!({ "type": "P", "t": id, "f": 0 });
        broadcast(&self.hub.channels_all(), payload);
    }

    /// Remove the player (if joined) and notify the remaining peers.
    fn disconnect(&mut self, reason: &str) {
        let Some(id) = self.player_id.clone() else {
            tracing::info!(connection = %self.conn, reason, "websocket closed");
            return;
        };

        if self.joined && self.hub.remove(&id) {
            let payload = json!({ "type": "R", "i": id });
            broadcast(&self.hub.channels_except(&id), payload);
        }

        tracing::info!(player = %id, nickname = NICKNAME, room = ROOM, reason, "penguin left");
    }

    /// Serialise and enqueue a JSON frame for this connection.
    fn send(&self, value: Value) {
        send_json(&self.tx, value);
    }
}

/// Broadcast a JSON frame to every supplied channel.
fn broadcast(targets: &[mpsc::Sender<Message>], value: Value) {
    let text = value.to_string();
    for tx in targets {
        let _ = tx.try_send(Message::text(text.clone()));
    }
}

/// Send one JSON frame on a channel, ignoring a closed receiver.
fn send_json(tx: &mpsc::Sender<Message>, value: Value) {
    let _ = tx.try_send(Message::text(value.to_string()));
}

/// Length in UTF-16 code units, matching the client's JavaScript `String.length`
/// so the server's limit is neither stricter nor looser than the client's.
fn utf16_len(value: &str) -> usize {
    value.chars().map(char::len_utf16).sum()
}

/// HTTP upgrade entry point for `GET /ws`.
pub async fn ws_handler(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let conn = format!("conn-{}", NEXT_CONNECTION.fetch_add(1, Ordering::Relaxed));
    let client = ClientInfo::from_headers(&headers, Some(peer));
    tracing::info!(
        connection = %conn,
        ip = %client.ip,
        user_agent = client.user_agent.as_deref().unwrap_or("-"),
        "websocket connected"
    );
    ws.max_message_size(MAX_FRAME_BYTES)
        .max_frame_size(MAX_FRAME_BYTES)
        .on_upgrade(move |socket| handle_socket(socket, state, conn, client))
}

/// Drive one connection: a writer task drains the outbound channel while the read
/// loop dispatches inbound frames until close, error, or shutdown.
async fn handle_socket(socket: WebSocket, state: AppState, conn: String, client: ClientInfo) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Message>(OUTBOUND_QUEUE);

    let mut shutdown_writer = state.shutdown_rx.clone();
    let writer = tokio::spawn(async move {
        loop {
            tokio::select! {
                maybe = rx.recv() => match maybe {
                    Some(message) => {
                        if sink.send(message).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                },
                _ = shutdown_writer.changed() => {
                    let _ = sink.send(Message::Close(None)).await;
                    break;
                }
            }
        }
    });

    let mut connection = Connection {
        conn: conn.clone(),
        client,
        hub: Arc::clone(&state.hub),
        tx: tx.clone(),
        player_id: None,
        x: 0.0,
        y: 0.0,
        joined: false,
        warned_malformed: false,
        last_chat: None,
        last_emote: None,
    };

    let mut shutdown_rx = state.shutdown_rx.clone();
    let reason = loop {
        tokio::select! {
            frame = stream.next() => match frame {
                Some(Ok(Message::Text(text))) => connection.handle_text(text.as_str()),
                Some(Ok(Message::Ping(data))) => {
                    let _ = connection.tx.try_send(Message::Pong(data));
                }
                Some(Ok(Message::Close(_))) => break "client close",
                Some(Ok(_)) => {}
                Some(Err(err)) => {
                    tracing::warn!(connection = %conn, error = %err, "websocket receive error");
                    let _ = connection.tx.try_send(Message::Close(None));
                    break "error";
                }
                None => break "client close",
            },
            _ = shutdown_rx.changed() => break "shutdown",
        }
    };

    connection.disconnect(reason);
    drop(connection);
    drop(tx);
    let _ = writer.await;
}

/// Pseudo-random spawn inside the 600x400 world, decorrelated by time and counter.
fn random_spawn() -> (f64, f64) {
    (SPAWN_X, SPAWN_Y)
}

/// 8-character lowercase hex id, matching the original server's player ids
/// (e.g. `fe489dc0`), derived from a time-seeded splitmix64 step so ids are not
/// guessable and do not reveal the connection order.
fn new_player_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or(0);
    let counter = NEXT_PLAYER.fetch_add(1, Ordering::Relaxed);
    let mut z = nanos ^ counter.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^= z >> 31;
    format!("{:08x}", (z & 0xFFFF_FFFF) as u32)
}
