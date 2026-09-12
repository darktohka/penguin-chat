//! Penguin Chat server: serves the static client and the `/ws` game protocol.

mod ws;

use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::routing::get;
use axum::Router;
use tokio::sync::watch;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::fmt::writer::BoxMakeWriter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

use ws::Hub;

/// Archived Penguin Chat client version, read from the `VERSION` file at build
/// time so the binary and the tagged container image always agree on it.
pub const VERSION: &str = include_str!("../VERSION");

/// Shared application state handed to every request handler.
#[derive(Clone)]
pub struct AppState {
    pub hub: Arc<Hub>,
    /// Flipped to `true` when a shutdown signal arrives; sockets select on it.
    pub shutdown_rx: watch::Receiver<bool>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _log_guard = init_tracing();

    let version = VERSION.trim();

    if env::args().any(|arg| arg == "--version" || arg == "-V") {
        println!("penguinchat {version}");
        return Ok(());
    }

    let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0".to_owned());
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(8080);
    let dist_dir = env::var("DIST_DIR").unwrap_or_else(|_| "dist".to_owned());

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let state = AppState {
        hub: Arc::new(Hub::new()),
        shutdown_rx,
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/version", get(version_handler))
        .route("/ws", get(ws::ws_handler))
        .fallback_service(ServeDir::new(&dist_dir))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = format!("{bind_addr}:{port}")
        .parse()
        .map_err(|err| format!("invalid bind address `{bind_addr}:{port}`: {err}"))?;
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tracing::info!(%addr, %dist_dir, version, "server listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_tx))
        .await?;

    tracing::info!("server stopped");
    Ok(())
}

/// `` health probe used by container orchestrators.
async fn healthz() -> &'static str {
    "ok"
}

/// Reports the archived client version the server was built for.
async fn version_handler() -> &'static str {
    VERSION.trim()
}

/// Initialise stdout logging plus daily-rotating file logs under `LOGS_DIR`.
///
/// The file appender writes `YYYY-MM-DD.log` (UTC date) and rolls over at
/// midnight. Returns the non-blocking writer guard, which must stay alive for
/// the lifetime of the process so buffered lines are flushed on shutdown.
fn init_tracing() -> Option<WorkerGuard> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let logs_dir = env::var("LOGS_DIR").unwrap_or_else(|_| "logs".to_owned());

    let (file_writer, guard) = match RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_suffix("log")
        .build(&logs_dir)
    {
        Ok(appender) => {
            let (writer, guard) = tracing_appender::non_blocking(appender);
            (BoxMakeWriter::new(writer), Some(guard))
        }
        Err(err) => {
            eprintln!("file logging disabled: cannot write to `{logs_dir}`: {err}");
            (BoxMakeWriter::new(std::io::sink), None)
        }
    };

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().with_ansi(false))
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(file_writer),
        )
        .init();

    guard
}

/// Resolves on `SIGINT` (Ctrl+C) or `SIGTERM`, then notifies the connection tasks.
async fn shutdown_signal(shutdown_tx: watch::Sender<bool>) {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
        "SIGINT"
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
                "SIGTERM"
            }
            Err(err) => {
                tracing::error!(error = %err, "failed to install SIGTERM handler");
                std::future::pending::<&str>().await
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<&str>();

    let signal = tokio::select! {
        signal = ctrl_c => signal,
        signal = terminate => signal,
    };

    tracing::info!(signal, "shutdown signal received, draining connections");
    let _ = shutdown_tx.send(true);
}
