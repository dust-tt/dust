use std::path::Path;

use anyhow::{Context, Result};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use tokio::io::AsyncWriteExt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DenyReason {
    ProxyDenied,
    ProxyProtocolError,
    DomainExtractionFailed,
}

impl DenyReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ProxyDenied => "proxy_denied",
            Self::ProxyProtocolError => "proxy_protocol_error",
            Self::DomainExtractionFailed => "domain_extraction_failed",
        }
    }
}

pub async fn append_deny_log(
    path: &Path,
    domain: &str,
    port: u16,
    reason: DenyReason,
) -> Result<()> {
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
        .with_context(|| format!("failed to open deny log {}", path.display()))?;
    let line = format_deny_log_line(domain, port, reason)?;
    file.write_all(line.as_bytes())
        .await
        .with_context(|| format!("failed to write deny log {}", path.display()))?;
    Ok(())
}

fn format_deny_log_line(domain: &str, port: u16, reason: DenyReason) -> Result<String> {
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .context("failed to format deny log timestamp")?;
    let domain = if domain.is_empty() {
        "<unknown>"
    } else {
        domain
    };
    Ok(format!(
        "{timestamp} DENIED {domain}:{port} (reason: {})\n",
        reason.as_str()
    ))
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::{append_deny_log, DenyReason};

    #[tokio::test]
    async fn appends_deny_log_entries() {
        let tempdir = tempdir().expect("tempdir should be created");
        let path = tempdir.path().join("deny.log");

        append_deny_log(&path, "api.openai.com", 443, DenyReason::ProxyDenied)
            .await
            .expect("first append should succeed");
        append_deny_log(&path, "", 80, DenyReason::DomainExtractionFailed)
            .await
            .expect("second append should succeed");

        let content = tokio::fs::read_to_string(&path)
            .await
            .expect("deny log should be readable");
        let lines: Vec<&str> = content.lines().collect();

        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("DENIED api.openai.com:443 (reason: proxy_denied)"));
        assert!(lines[1].contains("DENIED <unknown>:80 (reason: domain_extraction_failed)"));
    }
}
