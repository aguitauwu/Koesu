use axum::{
    Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
};
use dashmap::DashMap;
use lru::LruCache;
use mime_guess::from_path;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env,
    num::NonZeroUsize,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::{fs::File, io::AsyncReadExt};
use tracing::{error, info};
use walkdir::WalkDir;

type Cache = Arc<Mutex<LruCache<String, Vec<u8>>>>;
type MetaCache = Arc<DashMap<String, TrackMeta>>;

#[derive(Clone)]
struct AppState {
    music_dir: String,
    cache_dir: String,
    audio_cache: Cache,
    meta_cache: MetaCache,
}

#[derive(Serialize, Deserialize, Clone)]
struct TrackMeta {
    title: String,
    file_path: String,
    stream_url: String,
    source: String,
}

#[derive(Deserialize)]
struct ScanQuery {
    dir: Option<String>,
}

#[derive(Deserialize)]
struct AudioQuery {}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let port: u16 = env::var("KOESU_HTTP_PORT")
        .unwrap_or_else(|_| "7332".to_string())
        .parse()
        .unwrap_or(7332);

    let music_dir = env::var("MUSIC_DIR").unwrap_or_else(|_| "/root/musica".to_string());
    let cache_dir = env::var("CACHE_DIR").unwrap_or_else(|_| "/root/koesu/cache/audio".to_string());

    let cache_size = NonZeroUsize::new(256).unwrap();
    let state = AppState {
        music_dir,
        cache_dir,
        audio_cache: Arc::new(Mutex::new(LruCache::new(cache_size))),
        meta_cache: Arc::new(DashMap::new()),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/scan", get(scan))
        .route("/audio/*path", get(serve_audio))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();

    info!("koesu-http listening on port {}", port);
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "server": "koesu-http" }))
}

async fn scan(
    State(state): State<AppState>,
    Query(params): Query<ScanQuery>,
) -> Json<serde_json::Value> {
    let dir = params.dir.unwrap_or_else(|| state.music_dir.clone());
    let host = env::var("KOESU_HTTP_HOST").unwrap_or_else(|_| "172.17.0.1".to_string());
    let port = env::var("KOESU_HTTP_PORT").unwrap_or_else(|_| "7332".to_string());

    let extensions = ["opus", "mp3", "flac", "ogg", "wav", "m4a", "webm"];

    let tracks: Vec<serde_json::Value> = WalkDir::new(&dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| extensions.contains(&x))
                .unwrap_or(false)
        })
        .map(|e| {
            let path = e.path().to_string_lossy().to_string();
            let title = e
                .path()
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string();
            let encoded = urlencoding::encode(&path).to_string();
            let stream_url = format!("http://{}:{}/audio/{}", host, port, encoded);

            serde_json::json!({
                "title": title,
                "filePath": path,
                "streamUrl": stream_url,
                "source": "local",
            })
        })
        .collect();

    Json(serde_json::json!({ "tracks": tracks }))
}

async fn serve_audio(
    State(state): State<AppState>,
    Path(path): Path<String>,
    headers: HeaderMap,
) -> Response {
    let decoded = urlencoding::decode(&path)
        .unwrap_or_else(|_| path.clone().into())
        .to_string();

    let file_path = PathBuf::from(&decoded);

    if !file_path.exists() {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Archivo no encontrado"}))).into_response();
    }

    let cache_key = decoded.clone();

    {
        let mut cache = state.audio_cache.lock().unwrap();
        if let Some(data) = cache.get(&cache_key) {
            let mime = from_path(&file_path).first_or_octet_stream();
            return (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, mime.to_string()),
                    (header::ACCEPT_RANGES, "bytes".to_string()),
                    (header::CACHE_CONTROL, "no-cache".to_string()),
                ],
                data.clone(),
            )
                .into_response();
        }
    }

    let mut file = match File::open(&file_path).await {
        Ok(f) => f,
        Err(e) => {
            error!("failed to open file: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Error abriendo archivo").into_response();
        }
    };

    let metadata = match tokio::fs::metadata(&file_path).await {
        Ok(m) => m,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Error leyendo metadata").into_response(),
    };

    let file_size = metadata.len();
    let mime = from_path(&file_path).first_or_octet_stream();

    if let Some(range_header) = headers.get(header::RANGE) {
        let range_str = range_header.to_str().unwrap_or("");
        if let Some(range) = parse_range(range_str, file_size) {
            let (start, end) = range;
            let length = end - start + 1;

            use tokio::io::AsyncSeekExt;
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return (StatusCode::INTERNAL_SERVER_ERROR, "Error seeking").into_response();
            }

            let mut buf = vec![0u8; length as usize];
            if file.read_exact(&mut buf).await.is_err() {
                return (StatusCode::INTERNAL_SERVER_ERROR, "Error reading").into_response();
            }

            return (
                StatusCode::PARTIAL_CONTENT,
                [
                    (header::CONTENT_TYPE, mime.to_string()),
                    (header::CONTENT_RANGE, format!("bytes {}-{}/{}", start, end, file_size)),
                    (header::CONTENT_LENGTH, length.to_string()),
                    (header::ACCEPT_RANGES, "bytes".to_string()),
                ],
                buf,
            )
                .into_response();
        }
    }

    let mut buf = Vec::with_capacity(file_size as usize);
    if file.read_to_end(&mut buf).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Error leyendo archivo").into_response();
    }

    {
        let mut cache = state.audio_cache.lock().unwrap();
        cache.put(cache_key, buf.clone());
    }

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, mime.to_string()),
            (header::CONTENT_LENGTH, file_size.to_string()),
            (header::ACCEPT_RANGES, "bytes".to_string()),
            (header::CACHE_CONTROL, "no-cache".to_string()),
        ],
        buf,
    )
        .into_response()
}

fn parse_range(range: &str, file_size: u64) -> Option<(u64, u64)> {
    let range = range.strip_prefix("bytes=")?;
    let mut parts = range.split('-');
    let start: u64 = parts.next()?.parse().ok()?;
    let end: u64 = parts
        .next()
        .and_then(|s| if s.is_empty() { None } else { s.parse().ok() })
        .unwrap_or(file_size - 1);
    Some((start, end.min(file_size - 1)))
}
