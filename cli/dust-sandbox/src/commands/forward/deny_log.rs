use std::path::Path;

use anyhow::{Context, Result};
use serde::Serialize;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use tokio::io::AsyncWriteExt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DenyReason {
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
    ExpectContinueUnsupported,
    RequestTrailersUnsupported,
}

impl DenyReason {
    pub fn as_str(self) -> &'static str {
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
            Self::ExpectContinueUnsupported => "expect_continue_unsupported",
            Self::RequestTrailersUnsupported => "request_trailers_unsupported",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DenyLogEntry {
    pub reason: DenyReason,
    pub domain: Option<String>,
    pub port: Option<u16>,
    pub secret_name: Option<String>,
    pub sni: Option<String>,
    pub host: Option<String>,
}

impl DenyLogEntry {
    pub fn proxy(domain: &str, port: u16, reason: DenyReason) -> Self {
        Self {
            reason,
            domain: (!domain.is_empty()).then(|| domain.to_string()),
            port: Some(port),
            secret_name: None,
            sni: None,
            host: None,
        }
    }

    pub fn mitm(
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

pub async fn append_deny_log(path: &Path, entry: DenyLogEntry) -> Result<()> {
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
        .with_context(|| format!("failed to open deny log {}", path.display()))?;
    let line = format_deny_log_line(&entry)?;
    file.write_all(line.as_bytes())
        .await
        .with_context(|| format!("failed to write deny log {}", path.display()))?;
    Ok(())
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
    use serde_json::Value;
    use tempfile::tempdir;

    use super::{append_deny_log, DenyLogEntry, DenyReason};

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
}
