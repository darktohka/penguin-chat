# Penguin Chat

A self-hosted archival server for the browser revival of **Penguin Chat 1** (Experimental Penguins), version **1.20.2**.

It serves the original game client and the server from the same Docker image.

Live at <https://penguinchat.tohka.us>.

## Run with Docker

The published image is `darktohka/penguin-chat:latest` (also tagged `1.20.2`).

```sh
docker run -d \
  --name penguinchat \
  -p 8080:8080 \
  -v "$PWD/logs:/logs" \
  darktohka/penguin-chat:latest
```

Then open <http://localhost:8080>.

### Docker Compose

Available at [docker-compose.yml](./docker-compose.yml). When running behind a reverse proxy, please change `ports` to `expose` and put the container behind a shared network.

```sh
docker compose up -d
```

## Deploy behind a reverse proxy

In production, the server must be put behind a reverse proxy such as [Caddy](https://caddyserver.com/), which provides HTTPS. A ready-to-edit example is included as [`Caddyfile`](Caddyfile):

```sh
caddy run --config Caddyfile
```

Replace `penguinchat.com` with your domain and point it at the app (in Docker, `reverse_proxy penguinchat:8080`).

## Build from source

You need a Rust toolchain (1.97+).

```sh
cargo run --release
```

Or build the container image yourself:

```sh
docker build -t darktohka/penguin-chat:latest .
```

## Configuration

All configuration is via environment variables.

| Variable    | Default     | Description                                    |
|-------------|-------------|------------------------------------------------|
| `BIND_ADDR` | `0.0.0.0`   | Address to bind                                |
| `PORT`      | `8080`      | Port to listen on                              |
| `DIST_DIR`  | `dist`      | Directory containing the game client           |
| `LOGS_DIR`  | `logs`      | Directory for daily-rotating log files         |
| `RUST_LOG`  | `info`      | Log filter (e.g. `info`, `debug`, `penguinchat=debug`) |

## Logging

Logs go to both stdout and a file under `LOGS_DIR`. File names follow
`YYYY-MM-DD.log` (UTC) and rotate at midnight, for example `logs/2026-09-12.log`.

## Documentation

- [Protocol](docs/PROTOCOL.md) - the full WebSocket protocol reference.
- [Dead features](docs/DEAD_FEATURES.md) - protocol messages and assets the client implements but never uses (for example, there is no emote button; the server still handles emotes for protocol parity).

## About this archive

This project exists to preserve the browser release of Penguin Chat 1 (Experimental Penguins).

The client assets under `dist/` are the original build; the only modification is that the WebSocket URL now points at the same origin (`/ws`) instead of `wss://snowball.rocketsnail.com`.

Penguin Chat and Experimental Penguins are © RocketSnail Games. This is an unofficial archival project and is not affiliated with RocketSnail Games. We love Penguin Chat and Club Penguin!
