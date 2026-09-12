# syntax=docker/dockerfile:1

# --- Stage 1: build a fully static musl binary for the target architecture ----
FROM rust:1-alpine AS builder

# BuildKit supplies TARGETARCH (amd64 / arm64).
ARG TARGETARCH

RUN set -eux; \
    case "${TARGETARCH:-$(uname -m)}" in \
      amd64|x86_64) target=x86_64-unknown-linux-musl ;; \
      arm64|aarch64) target=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported architecture: ${TARGETARCH:-$(uname -m)}" >&2; exit 1 ;; \
    esac; \
    echo "$target" > /rust-target; \
    apk add --no-cache musl-dev build-base; \
    rustup target add "$target"

WORKDIR /build

# Pre-fetch dependencies so the dependency layer is cached independently.
COPY Cargo.toml Cargo.lock ./

RUN mkdir src && printf 'fn main() {}' > src/main.rs \
    && cargo fetch


# Build the Penguin Chat binary
COPY VERSION ./
COPY src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    target="$(cat /rust-target)" \
    && cargo build --release --target "$target" \
    && cp "target/$target/release/penguinchat" /build/penguinchat

# --- Stage 2: minimal scratch runtime ----------------------------------------
FROM scratch

# Callers pass --build-arg VERSION="$(cat VERSION)" so the image metadata cannot
# drift from the VERSION file the binary is compiled against.
ARG VERSION=dev
LABEL org.opencontainers.image.title="Penguin Chat" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.description="Self-hosted archival server for Penguin Chat 1 (Experimental Penguins)"

COPY --from=builder /build/penguinchat /app/penguinchat
COPY dist /dist

ENV DIST_DIR=/dist \
    PORT=8080 \
    BIND_ADDR=0.0.0.0 \
    LOGS_DIR=/logs \
    RUST_LOG=info

EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/app/penguinchat"]
