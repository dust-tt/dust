use std::io::ErrorKind;
use std::path::{Path, PathBuf};
#[cfg(test)]
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
};

use anyhow::{Context, Result};
use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use tokio::io::AsyncWriteExt;
#[cfg(test)]
use tokio::sync::broadcast;

// Keep deny logging bounded on the sandbox writable mount. One previous
// generation is retained as `<path>.1`; a single line larger than this cap can
// still exceed the cap after rotation, but normal deny entries are tiny.
const DENY_LOG_MAX_BYTES: u64 = 8 * 1024 * 1024;
static DENY_LOG_WRITE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum DenyReason {
    ProxyDenied,
    ProxyProtocolError,
    DomainExtractionFailed,
    PlaceholderOnNonAllowed,
    HostSniMismatch,
    ConnectMethodForbidden,
    UrlLinePlaceholder,
    MalformedHeaders,
    DuplicateHost,
    MissingHost,
    AbsoluteUriAuthorityMismatch,
    Port80Placeholder,
    HeaderSizeExceeded,
    RequestTrailersUnsupported,
}

impl DenyReason {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::ProxyDenied => "proxy_denied",
            Self::ProxyProtocolError => "proxy_protocol_error",
            Self::DomainExtractionFailed => "domain_extraction_failed",
            Self::PlaceholderOnNonAllowed => "placeholder_on_non_allowed",
            Self::HostSniMismatch => "host_sni_mismatch",
            Self::ConnectMethodForbidden => "connect_method_forbidden",
            Self::UrlLinePlaceholder => "url_line_placeholder",
            Self::MalformedHeaders => "malformed_headers",
            Self::DuplicateHost => "duplicate_host",
            Self::MissingHost => "missing_host",
            Self::AbsoluteUriAuthorityMismatch => "absolute_uri_authority_mismatch",
            Self::Port80Placeholder => "port_80_placeholder",
            Self::HeaderSizeExceeded => "header_size_exceeded",
            Self::RequestTrailersUnsupported => "request_trailers_unsupported",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct DenyLogEntry {
    pub(super) reason: DenyReason,
    pub(super) domain: Option<String>,
    pub(super) port: Option<u16>,
    pub(super) secret_name: Option<String>,
    pub(super) sni: Option<String>,
    pub(super) host: Option<String>,
}

impl DenyLogEntry {
    pub(super) fn proxy(domain: &str, port: u16, reason: DenyReason) -> Self {
        Self {
            reason,
            domain: (!domain.is_empty()).then(|| domain.to_string()),
            port: Some(port),
            secret_name: None,
            sni: None,
            host: None,
        }
    }

    pub(super) fn mitm(
        reason: DenyReason,
        domain: Option<&str>,
        port: u16,
        secret_name: Option<&str>,
        sni: Option<&str>,
        host: Option<&str>,
    ) -> Self {
        Self {
            reason,
            domain: domain.filter(|value| !value.is_empty()).map(str::to_string),
            port: Some(port),
            secret_name: secret_name.map(str::to_string),
            sni: sni.filter(|value| !value.is_empty()).map(str::to_string),
            host: host.filter(|value| !value.is_empty()).map(str::to_string),
        }
    }
}

pub(super) async fn append_deny_log(path: &Path, entry: DenyLogEntry) -> Result<()> {
    let line = format_deny_log_line(&entry)?;
    append_deny_log_line(path, &line, DENY_LOG_MAX_BYTES).await
}

async fn append_deny_log_line(path: &Path, line: &str, max_bytes: u64) -> Result<()> {
    let _guard = DENY_LOG_WRITE_LOCK.lock().await;
    rotate_deny_log_if_needed(path, line.len() as u64, max_bytes).await?;
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
        .with_context(|| format!("failed to open deny log {}", path.display()))?;
    file.write_all(line.as_bytes())
        .await
        .with_context(|| format!("failed to write deny log {}", path.display()))?;
    // Flush before notifying test waiters: the file is dropped after the notify,
    // so its implicit drop-flush would race readers woken by the notify.
    file.flush()
        .await
        .with_context(|| format!("failed to flush deny log {}", path.display()))?;
    #[cfg(test)]
    notify_deny_log_write(path);
    Ok(())
}

async fn rotate_deny_log_if_needed(
    path: &Path,
    next_line_bytes: u64,
    max_bytes: u64,
) -> Result<()> {
    let current_bytes = match tokio::fs::metadata(path).await {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(error)
                .with_context(|| format!("failed to stat deny log {}", path.display()));
        }
    };

    if current_bytes.saturating_add(next_line_bytes) <= max_bytes {
        return Ok(());
    }

    let rotated_path = rotated_deny_log_path(path);
    match tokio::fs::remove_file(&rotated_path).await {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "failed to remove rotated deny log {}",
                    rotated_path.display()
                )
            });
        }
    }
    match tokio::fs::rename(path, &rotated_path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| {
            format!(
                "failed to rotate deny log {} to {}",
                path.display(),
                rotated_path.display()
            )
        }),
    }
}

fn rotated_deny_log_path(path: &Path) -> PathBuf {
    let mut rotated = path.as_os_str().to_os_string();
    rotated.push(".1");
    PathBuf::from(rotated)
}

#[cfg(test)]
static DENY_LOG_WRITE_SIGNALS: OnceLock<Mutex<HashMap<PathBuf, broadcast::Sender<()>>>> =
    OnceLock::new();

#[cfg(test)]
pub(super) struct DenyLogWriteObserver {
    path: PathBuf,
    rx: broadcast::Receiver<()>,
}

#[cfg(test)]
impl DenyLogWriteObserver {
    pub(super) async fn wait(&mut self) -> Result<()> {
        self.rx
            .recv()
            .await
            .with_context(|| format!("deny log write signal closed for {}", self.path.display()))?;
        Ok(())
    }
}

#[cfg(test)]
pub(super) fn observe_deny_log_writes(path: &Path) -> DenyLogWriteObserver {
    DenyLogWriteObserver {
        path: path.to_path_buf(),
        rx: deny_log_write_signal(path).subscribe(),
    }
}

#[cfg(test)]
fn notify_deny_log_write(path: &Path) {
    let _ = deny_log_write_signal(path).send(());
}

#[cfg(test)]
fn deny_log_write_signal(path: &Path) -> broadcast::Sender<()> {
    let mut signals = DENY_LOG_WRITE_SIGNALS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .expect("deny log write signal lock poisoned");
    signals
        .entry(path.to_path_buf())
        .or_insert_with(|| {
            let (tx, _rx) = broadcast::channel(16);
            tx
        })
        .clone()
}

#[derive(Serialize)]
struct JsonDenyLogLine<'a> {
    ts: &'a str,
    reason: &'a str,
    domain: Option<&'a str>,
    port: Option<u16>,
    secret_name: &'a str,
    sni: Option<&'a str>,
    host: Option<&'a str>,
}

fn format_deny_log_line(entry: &DenyLogEntry) -> Result<String> {
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .context("failed to format deny log timestamp")?;
    let line = JsonDenyLogLine {
        ts: &timestamp,
        reason: entry.reason.as_str(),
        domain: entry.domain.as_deref(),
        port: entry.port,
        secret_name: entry.secret_name.as_deref().unwrap_or("unknown"),
        sni: entry.sni.as_deref(),
        host: entry.host.as_deref(),
    };
    Ok(format!("{}\n", serde_json::to_string(&line)?))
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use serde_json::Value;
    use tempfile::tempdir;

    use super::{
        append_deny_log, append_deny_log_line, observe_deny_log_writes, rotated_deny_log_path,
        DenyLogEntry, DenyReason,
    };

    #[tokio::test]
    async fn appends_json_deny_log_entries() {
        let tempdir = tempdir().expect("tempdir should be created");
        let path = tempdir.path().join("deny.log");

        append_deny_log(
            &path,
            DenyLogEntry::proxy("api.openai.com", 443, DenyReason::ProxyDenied),
        )
        .await
        .expect("first append should succeed");
        append_deny_log(
            &path,
            DenyLogEntry::mitm(
                DenyReason::HostSniMismatch,
                Some("api.openai.com"),
                443,
                Some("OPENAI_API_KEY"),
                Some("api.openai.com"),
                Some("evil.example"),
            ),
        )
        .await
        .expect("second append should succeed");

        let content = tokio::fs::read_to_string(&path)
            .await
            .expect("deny log should be readable");
        let lines: Vec<&str> = content.lines().collect();

        assert_eq!(lines.len(), 2);

        let first: Value = serde_json::from_str(lines[0]).expect("first line should be JSON");
        assert_eq!(first["reason"], "proxy_denied");
        assert_eq!(first["domain"], "api.openai.com");
        assert_eq!(first["port"], 443);
        assert_eq!(first["secret_name"], "unknown");

        let second: Value = serde_json::from_str(lines[1]).expect("second line should be JSON");
        assert_eq!(second["reason"], "host_sni_mismatch");
        assert_eq!(second["secret_name"], "OPENAI_API_KEY");
        assert_eq!(second["sni"], "api.openai.com");
        assert_eq!(second["host"], "evil.example");
    }

    #[tokio::test]
    async fn write_observer_fires_after_content_is_readable() {
        let tempdir = tempdir().expect("tempdir should be created");
        let path = tempdir.path().join("deny.log");
        let mut observer = observe_deny_log_writes(&path);
        let write_path = path.clone();
        let write =
            tokio::spawn(async move { append_deny_log_line(&write_path, "visible\n", 64).await });

        observer
            .wait()
            .await
            .expect("observer should receive write notification");
        let content = tokio::fs::read_to_string(&path)
            .await
            .expect("deny log should be readable after notification");
        assert_eq!(content, "visible\n");

        write
            .await
            .expect("append task should finish")
            .expect("append should succeed");
    }

    #[tokio::test]
    async fn preserves_appends_below_cap() {
        let tempdir = tempdir().expect("tempdir should be created");
        let path = tempdir.path().join("deny.log");

        append_deny_log_line(&path, "first\n", 64)
            .await
            .expect("first append should succeed");
        append_deny_log_line(&path, "second\n", 64)
            .await
            .expect("second append should succeed");

        let content = tokio::fs::read_to_string(&path)
            .await
            .expect("deny log should be readable");
        assert_eq!(content, "first\nsecond\n");
        assert!(
            tokio::fs::metadata(rotated_deny_log_path(&path))
                .await
                .is_err(),
            "rotation should not create a previous generation below cap"
        );
    }

    #[tokio::test]
    async fn rotates_when_append_crosses_cap() {
        let tempdir = tempdir().expect("tempdir should be created");
        let path = tempdir.path().join("deny.log");
        let rotated_path = rotated_deny_log_path(&path);

        append_deny_log_line(&path, "first\n", 12)
            .await
            .expect("first append should succeed");
        append_deny_log_line(&path, "second\n", 12)
            .await
            .expect("second append should succeed");

        let current = tokio::fs::read_to_string(&path)
            .await
            .expect("current deny log should be readable");
        let rotated = tokio::fs::read_to_string(&rotated_path)
            .await
            .expect("rotated deny log should be readable");
        assert_eq!(current, "second\n");
        assert_eq!(rotated, "first\n");
    }

    #[tokio::test]
    async fn concurrent_appends_near_cap_do_not_tear_lines() {
        let tempdir = tempdir().expect("tempdir should be created");
        let path = tempdir.path().join("deny.log");
        let rotated_path = rotated_deny_log_path(&path);
        append_deny_log_line(
            &path,
            "pppppppppppppppppppppppppppppppppppppppppppppppppp\n",
            80,
        )
        .await
        .expect("prefill append should succeed");

        let first_path = path.clone();
        let first = tokio::spawn(async move {
            append_deny_log_line(&first_path, "line-a-aaaaaaaaaaaa\n", 80).await
        });
        let second_path = path.clone();
        let second = tokio::spawn(async move {
            append_deny_log_line(&second_path, "line-b-bbbbbbbbbbbb\n", 80).await
        });

        first
            .await
            .expect("first append task should finish")
            .expect("first append should succeed");
        second
            .await
            .expect("second append task should finish")
            .expect("second append should succeed");

        let current = tokio::fs::read_to_string(&path)
            .await
            .expect("current deny log should be readable");
        let rotated = match tokio::fs::read_to_string(&rotated_path).await {
            Ok(rotated) => rotated,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => panic!("rotated deny log should be readable: {error}"),
        };
        let observed = current.lines().chain(rotated.lines()).collect::<Vec<_>>();
        let allowed = HashSet::from([
            "pppppppppppppppppppppppppppppppppppppppppppppppppp",
            "line-a-aaaaaaaaaaaa",
            "line-b-bbbbbbbbbbbb",
        ]);
        assert!(
            observed.iter().all(|line| allowed.contains(line)),
            "observed torn or unexpected lines: {observed:?}"
        );
        assert!(
            observed
                .iter()
                .any(|line| matches!(*line, "line-a-aaaaaaaaaaaa" | "line-b-bbbbbbbbbbbb")),
            "expected at least one completed concurrent append: {observed:?}"
        );
    }
}
