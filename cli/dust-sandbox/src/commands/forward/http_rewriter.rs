use std::collections::HashSet;
use std::fmt;
use std::io::ErrorKind;

use anyhow::{anyhow, Context};
use base64::{engine::general_purpose, Engine as _};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot};

use crate::egress_secrets::{
    Secret, SecretTable, PLACEHOLDER_HEX_LEN, PLACEHOLDER_PREFIX as PLACEHOLDER_PREFIX_STR,
    PLACEHOLDER_SUFFIX as PLACEHOLDER_SUFFIX_STR,
};

use super::deny_log::{DenyLogEntry, DenyReason};

// Matches nginx's default large_client_header_buffers (4 x 8 KiB = 32 KiB).
const MAX_HEADER_BLOCK_BYTES: usize = 32 * 1024;
const MAX_HEADER_LINE_BYTES: usize = 16 * 1024;
// httparse defaults to 100; we bump to 128 to leave headroom for instrumented
// agents (cloud-trace, sentry, etc.) without paying a real cost.
const MAX_HEADERS: usize = 128;
const READ_CHUNK_BYTES: usize = 8 * 1024;
const NON_HTTP_FALLBACK_BYTES: usize = 4 * 1024;
const MAX_CHUNK_LINE_BYTES: usize = 8 * 1024;

const PLACEHOLDER_PREFIX: &[u8] = PLACEHOLDER_PREFIX_STR.as_bytes();
const PLACEHOLDER_SUFFIX: &[u8] = PLACEHOLDER_SUFFIX_STR.as_bytes();
const PLACEHOLDER_LEN: usize =
    PLACEHOLDER_PREFIX_STR.len() + PLACEHOLDER_HEX_LEN + PLACEHOLDER_SUFFIX_STR.len();

#[derive(Clone, Copy, Debug)]
pub(super) enum HttpRewriteMode<'a> {
    Tls { sni: &'a str },
    PlainHttp { domain: &'a str },
}

impl HttpRewriteMode<'_> {
    fn port(self) -> u16 {
        match self {
            Self::Tls { .. } => 443,
            Self::PlainHttp { .. } => 80,
        }
    }

    fn domain(&self) -> Option<&str> {
        match self {
            Self::Tls { sni } => Some(sni),
            Self::PlainHttp { domain } => Some(domain),
        }
    }

    fn sni(&self) -> Option<&str> {
        match self {
            Self::Tls { sni } => Some(sni),
            Self::PlainHttp { .. } => None,
        }
    }

    fn default_host_port(self) -> u16 {
        match self {
            Self::Tls { .. } => 443,
            Self::PlainHttp { .. } => 80,
        }
    }
}

#[derive(Debug)]
pub(super) enum HttpRewriteError {
    Denied(DenyLogEntry),
    Io(anyhow::Error),
}

pub(super) struct WebSocketUpgradeWatch {
    pub accepted_tx: oneshot::Sender<bool>,
}

impl fmt::Display for HttpRewriteError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Denied(entry) => {
                write!(formatter, "HTTP rewrite denied: {}", entry.reason.as_str())
            }
            Self::Io(error) => write!(formatter, "{error}"),
        }
    }
}

impl std::error::Error for HttpRewriteError {}

impl HttpRewriteError {
    fn io(error: impl Into<anyhow::Error>) -> Self {
        Self::Io(error.into())
    }

    fn denied(
        mode: HttpRewriteMode<'_>,
        reason: DenyReason,
        secret_name: Option<&str>,
        host: Option<&str>,
    ) -> Self {
        Self::Denied(DenyLogEntry::mitm(
            reason,
            mode.domain(),
            mode.port(),
            secret_name,
            mode.sni(),
            host,
        ))
    }
}

type RewriteResult<T> = std::result::Result<T, HttpRewriteError>;

pub(super) async fn forward_http1_requests<R, W>(
    client: &mut R,
    upstream: &mut W,
    secret_table: &SecretTable,
    mode: HttpRewriteMode<'_>,
    websocket_watch_tx: Option<&mpsc::Sender<WebSocketUpgradeWatch>>,
) -> RewriteResult<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut reader = BufferedReader::new(client);
    let mut parsed_first_http_request = false;

    loop {
        let allow_non_http_fallback =
            matches!(mode, HttpRewriteMode::Tls { .. }) && !parsed_first_http_request;
        let header_len = match reader
            .read_header_block(mode, allow_non_http_fallback)
            .await?
        {
            HeaderRead::Eof => {
                shutdown_upstream(upstream).await?;
                return Ok(());
            }
            HeaderRead::NonHttp => {
                copy_raw_client_to_upstream(&mut reader, upstream).await?;
                return Ok(());
            }
            HeaderRead::Header(header_len) => header_len,
        };

        let request = parse_request(&reader.buffer[..header_len], mode)?;
        parsed_first_http_request = true;
        let processed = process_request(&request, secret_table, mode)?;
        let websocket_watch = if processed.websocket_upgrade {
            Some(start_websocket_watch(websocket_watch_tx).await?)
        } else {
            None
        };

        reader.drain_front(header_len);
        upstream
            .write_all(&processed.header_bytes)
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        forward_body(&mut reader, upstream, processed.body_kind, mode).await?;

        if let Some(websocket_watch) = websocket_watch {
            if websocket_watch.accepted().await? {
                copy_raw_client_to_upstream(&mut reader, upstream).await?;
                return Ok(());
            }
        }
    }
}

enum PendingWebSocketWatch {
    Watch(oneshot::Receiver<bool>),
    AssumeAccepted,
}

impl PendingWebSocketWatch {
    async fn accepted(self) -> RewriteResult<bool> {
        match self {
            Self::AssumeAccepted => Ok(true),
            Self::Watch(accepted_rx) => accepted_rx
                .await
                .map_err(|_| HttpRewriteError::io(anyhow!("response watcher stopped"))),
        }
    }
}

async fn start_websocket_watch(
    websocket_watch_tx: Option<&mpsc::Sender<WebSocketUpgradeWatch>>,
) -> RewriteResult<PendingWebSocketWatch> {
    let Some(websocket_watch_tx) = websocket_watch_tx else {
        return Ok(PendingWebSocketWatch::AssumeAccepted);
    };

    let (accepted_tx, accepted_rx) = oneshot::channel();
    websocket_watch_tx
        .send(WebSocketUpgradeWatch { accepted_tx })
        .await
        .map_err(|_| HttpRewriteError::io(anyhow!("response watcher stopped")))?;
    Ok(PendingWebSocketWatch::Watch(accepted_rx))
}

struct BufferedReader<'a, R> {
    inner: &'a mut R,
    buffer: Vec<u8>,
}

impl<'a, R> BufferedReader<'a, R>
where
    R: AsyncRead + Unpin,
{
    fn new(inner: &'a mut R) -> Self {
        Self {
            inner,
            buffer: Vec::new(),
        }
    }

    async fn read_header_block(
        &mut self,
        mode: HttpRewriteMode<'_>,
        allow_non_http_fallback: bool,
    ) -> RewriteResult<HeaderRead> {
        loop {
            if let Some(header_end) = find_subslice(&self.buffer, b"\r\n\r\n") {
                let header_len = header_end + 4;
                if header_len > MAX_HEADER_BLOCK_BYTES {
                    return Err(HttpRewriteError::denied(
                        mode,
                        DenyReason::MalformedHeaders,
                        None,
                        None,
                    ));
                }
                return Ok(HeaderRead::Header(header_len));
            }

            if self.buffer.len() >= MAX_HEADER_BLOCK_BYTES {
                return Err(HttpRewriteError::denied(
                    mode,
                    DenyReason::MalformedHeaders,
                    None,
                    None,
                ));
            }

            if allow_non_http_fallback && is_definitely_non_http(&self.buffer) {
                return Ok(HeaderRead::NonHttp);
            }

            if allow_non_http_fallback
                && self.buffer.len() >= NON_HTTP_FALLBACK_BYTES
                && !looks_like_http_request_line(&self.buffer)
            {
                return Ok(HeaderRead::NonHttp);
            }

            let mut chunk = [0_u8; READ_CHUNK_BYTES];
            let bytes_read = match self.inner.read(&mut chunk).await {
                Ok(bytes_read) => bytes_read,
                Err(error)
                    if error.kind() == ErrorKind::UnexpectedEof && self.buffer.is_empty() =>
                {
                    return Ok(HeaderRead::Eof);
                }
                Err(error) => return Err(HttpRewriteError::io(anyhow!(error))),
            };
            if bytes_read == 0 {
                if self.buffer.is_empty() {
                    return Ok(HeaderRead::Eof);
                }
                return Err(HttpRewriteError::denied(
                    mode,
                    DenyReason::MalformedHeaders,
                    None,
                    None,
                ));
            }
            self.buffer.extend_from_slice(&chunk[..bytes_read]);
        }
    }

    fn drain_front(&mut self, len: usize) {
        self.buffer.drain(..len);
    }

    async fn read_line(&mut self, mode: HttpRewriteMode<'_>) -> RewriteResult<Vec<u8>> {
        loop {
            if let Some(line_end) = find_subslice(&self.buffer, b"\r\n") {
                let line_len = line_end + 2;
                if line_len > MAX_CHUNK_LINE_BYTES {
                    return Err(HttpRewriteError::denied(
                        mode,
                        DenyReason::MalformedHeaders,
                        None,
                        None,
                    ));
                }
                let line = self.buffer[..line_len].to_vec();
                self.drain_front(line_len);
                return Ok(line);
            }

            if self.buffer.len() > MAX_CHUNK_LINE_BYTES {
                return Err(HttpRewriteError::denied(
                    mode,
                    DenyReason::MalformedHeaders,
                    None,
                    None,
                ));
            }

            let mut chunk = [0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
            if bytes_read == 0 {
                return Err(HttpRewriteError::denied(
                    mode,
                    DenyReason::MalformedHeaders,
                    None,
                    None,
                ));
            }
            self.buffer.extend_from_slice(&chunk[..bytes_read]);
        }
    }
}

enum HeaderRead {
    Eof,
    Header(usize),
    NonHttp,
}

#[derive(Clone, Debug)]
struct RequestParts {
    method: String,
    uri: String,
    headers: Vec<HeaderPart>,
}

#[derive(Clone, Debug)]
struct HeaderPart {
    name: String,
    value: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BodyKind {
    None,
    ContentLength(usize),
    Chunked,
}

#[derive(Debug)]
struct ProcessedRequest {
    header_bytes: Vec<u8>,
    body_kind: BodyKind,
    websocket_upgrade: bool,
}

fn parse_request(bytes: &[u8], mode: HttpRewriteMode<'_>) -> RewriteResult<RequestParts> {
    let mut headers = [httparse::EMPTY_HEADER; MAX_HEADERS];
    let mut request = httparse::Request::new(&mut headers);
    let status = request
        .parse(bytes)
        .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None))?;

    if !status.is_complete() {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::MalformedHeaders,
            None,
            None,
        ));
    }

    let method = request
        .method
        .ok_or_else(|| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None))?;
    let uri = request
        .path
        .ok_or_else(|| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None))?;
    let version = request
        .version
        .ok_or_else(|| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None))?;

    if version != 1 {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::MalformedHeaders,
            None,
            None,
        ));
    }

    let headers = request
        .headers
        .iter()
        .map(|header| HeaderPart {
            name: header.name.to_string(),
            value: header.value.to_vec(),
        })
        .collect();

    Ok(RequestParts {
        method: method.to_string(),
        uri: uri.to_string(),
        headers,
    })
}

fn process_request(
    request: &RequestParts,
    secret_table: &SecretTable,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<ProcessedRequest> {
    let request_line = format!("{} {} HTTP/1.1", request.method, request.uri);
    if contains_placeholder(request_line.as_bytes()) {
        return Err(match mode {
            HttpRewriteMode::PlainHttp { .. } => HttpRewriteError::denied(
                mode,
                DenyReason::Port80Placeholder,
                None,
                normalized_host_for_log(request, mode).as_deref(),
            ),
            HttpRewriteMode::Tls { .. } => HttpRewriteError::denied(
                mode,
                DenyReason::UrlLinePlaceholder,
                None,
                normalized_host_for_log(request, mode).as_deref(),
            ),
        });
    }

    let host = normalized_single_host(request, mode)?;
    validate_absolute_uri_authority(&request.uri, &host, mode)?;

    let mut header_bytes = Vec::new();
    header_bytes.extend_from_slice(request_line.as_bytes());
    header_bytes.extend_from_slice(b"\r\n");

    let body_kind = body_kind(request, mode, Some(&host))?;
    let websocket_upgrade = is_websocket_upgrade(request);

    for header in &request.headers {
        let rewritten_value = rewrite_header_value(header, &host, secret_table, mode)?;
        let line_len = header.name.len() + 2 + rewritten_value.len() + 2;
        if line_len > MAX_HEADER_LINE_BYTES {
            return Err(HttpRewriteError::denied(
                mode,
                DenyReason::HeaderSizeExceeded,
                None,
                Some(&host),
            ));
        }

        header_bytes.extend_from_slice(header.name.as_bytes());
        header_bytes.extend_from_slice(b": ");
        header_bytes.extend_from_slice(&rewritten_value);
        header_bytes.extend_from_slice(b"\r\n");
    }

    header_bytes.extend_from_slice(b"\r\n");
    if header_bytes.len() > MAX_HEADER_BLOCK_BYTES {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::HeaderSizeExceeded,
            None,
            Some(&host),
        ));
    }

    Ok(ProcessedRequest {
        header_bytes,
        body_kind,
        websocket_upgrade,
    })
}

fn normalized_host_for_log(request: &RequestParts, mode: HttpRewriteMode<'_>) -> Option<String> {
    request
        .headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case("host"))
        .and_then(|header| {
            std::str::from_utf8(&header.value)
                .ok()
                .and_then(|value| normalize_host(value, mode.default_host_port()).ok())
        })
}

fn normalized_single_host(
    request: &RequestParts,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<String> {
    let hosts = request
        .headers
        .iter()
        .filter(|header| header.name.eq_ignore_ascii_case("host"))
        .collect::<Vec<_>>();

    if hosts.is_empty() {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::MissingHost,
            None,
            None,
        ));
    }
    if hosts.len() > 1 {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::DuplicateHost,
            None,
            None,
        ));
    }

    let host_value = std::str::from_utf8(&hosts[0].value)
        .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None))?;
    let host = normalize_host(host_value, mode.default_host_port())
        .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None))?;

    if let HttpRewriteMode::Tls { sni } = mode {
        let normalized_sni = normalize_host(sni, 443).map_err(|_| {
            HttpRewriteError::denied(mode, DenyReason::HostSniMismatch, None, Some(&host))
        })?;
        if normalized_sni != host {
            return Err(HttpRewriteError::denied(
                mode,
                DenyReason::HostSniMismatch,
                None,
                Some(&host),
            ));
        }
    }

    Ok(host)
}

fn validate_absolute_uri_authority(
    uri: &str,
    host: &str,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<()> {
    let Some((authority, default_port)) = absolute_uri_authority(uri) else {
        return Ok(());
    };
    let normalized_authority = normalize_host(authority, default_port).map_err(|_| {
        HttpRewriteError::denied(
            mode,
            DenyReason::AbsoluteUriAuthorityMismatch,
            None,
            Some(host),
        )
    })?;
    // `host` was already verified to equal SNI by `normalized_single_host` in
    // TLS mode, so comparing `normalized_authority == host` is sufficient.
    if normalized_authority != host {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::AbsoluteUriAuthorityMismatch,
            None,
            Some(host),
        ));
    }

    Ok(())
}

fn absolute_uri_authority(uri: &str) -> Option<(&str, u16)> {
    let (after_scheme, default_port) = if let Some(rest) = uri.strip_prefix("https://") {
        (rest, 443)
    } else if let Some(rest) = uri.strip_prefix("http://") {
        (rest, 80)
    } else {
        return None;
    };

    let authority_end = after_scheme.find('/').unwrap_or(after_scheme.len());
    let authority = &after_scheme[..authority_end];
    Some((authority, default_port))
}

fn rewrite_header_value(
    header: &HeaderPart,
    host: &str,
    secret_table: &SecretTable,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<Vec<u8>> {
    if matches!(mode, HttpRewriteMode::PlainHttp { .. }) && contains_placeholder(&header.value) {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::Port80Placeholder,
            None,
            Some(host),
        ));
    }

    if header.name.eq_ignore_ascii_case("authorization") {
        if let Some(value) = rewrite_basic_auth(&header.value, host, secret_table, mode)? {
            return Ok(value);
        }
    }

    match substitute_placeholders(&header.value, host, secret_table, mode)? {
        Some(rewritten) => Ok(rewritten),
        None => Ok(header.value.clone()),
    }
}

fn rewrite_basic_auth(
    value: &[u8],
    host: &str,
    secret_table: &SecretTable,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<Option<Vec<u8>>> {
    let Ok(value_text) = std::str::from_utf8(value) else {
        return Ok(None);
    };
    let trimmed = value_text.trim();
    let Some(rest) = strip_basic_prefix(trimmed) else {
        return Ok(None);
    };

    // If base64 decode fails (malformed Basic auth value), fall back to the
    // general substitution path so any placeholder in the raw header bytes
    // still gets rewritten on TLS, or rejected by the plain-HTTP guard above.
    let Ok(decoded) = general_purpose::STANDARD.decode(rest.trim()) else {
        return Ok(None);
    };

    if matches!(mode, HttpRewriteMode::PlainHttp { .. }) && contains_placeholder(&decoded) {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::Port80Placeholder,
            None,
            Some(host),
        ));
    }

    let Some(rewritten_decoded) = substitute_placeholders(&decoded, host, secret_table, mode)?
    else {
        return Ok(None);
    };
    let encoded = general_purpose::STANDARD.encode(rewritten_decoded);
    Ok(Some(format!("Basic {encoded}").into_bytes()))
}

fn strip_basic_prefix(value: &str) -> Option<&str> {
    if value.len() < "basic".len() {
        return None;
    }
    let (scheme, rest) = value.split_at("basic".len());
    if !scheme.eq_ignore_ascii_case("basic") {
        return None;
    }
    if rest.is_empty() || !rest.as_bytes()[0].is_ascii_whitespace() {
        return None;
    }
    Some(rest)
}

fn substitute_placeholders(
    input: &[u8],
    host: &str,
    secret_table: &SecretTable,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<Option<Vec<u8>>> {
    let mut output = Vec::with_capacity(input.len());
    let mut last_copied = 0;
    let mut cursor = 0;
    let mut changed = false;

    while cursor + PLACEHOLDER_LEN <= input.len() {
        if !input[cursor..].starts_with(PLACEHOLDER_PREFIX) {
            cursor += 1;
            continue;
        }

        let candidate_end = cursor + PLACEHOLDER_LEN;
        if !is_valid_placeholder_bytes(&input[cursor..candidate_end]) {
            cursor += 1;
            continue;
        }

        let placeholder = std::str::from_utf8(&input[cursor..candidate_end]).map_err(|_| {
            HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, Some(host))
        })?;
        let secret = secret_table
            .by_placeholder
            .get(placeholder)
            .ok_or_else(|| {
                HttpRewriteError::denied(
                    mode,
                    DenyReason::PlaceholderOnNonAllowed,
                    Some("unknown"),
                    Some(host),
                )
            })?;

        validate_secret_for_host(secret, host, mode)?;
        output.extend_from_slice(&input[last_copied..cursor]);
        output.extend_from_slice(secret.value.as_bytes());
        changed = true;
        cursor = candidate_end;
        last_copied = candidate_end;
    }

    if !changed {
        return Ok(None);
    }

    output.extend_from_slice(&input[last_copied..]);
    Ok(Some(output))
}

fn validate_secret_for_host(
    secret: &Secret,
    host: &str,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<()> {
    if secret
        .value
        .bytes()
        .any(|byte| byte.is_ascii_control() || byte == 0x7f)
    {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::ValueControlChar,
            Some(&secret.name),
            Some(host),
        ));
    }

    if !secret.allowed_domains.matches(host) {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::PlaceholderOnNonAllowed,
            Some(&secret.name),
            Some(host),
        ));
    }

    if let HttpRewriteMode::Tls { sni } = mode {
        if !secret.allowed_domains.matches(sni) {
            return Err(HttpRewriteError::denied(
                mode,
                DenyReason::PlaceholderOnNonAllowed,
                Some(&secret.name),
                Some(host),
            ));
        }
    }

    Ok(())
}

fn body_kind(
    request: &RequestParts,
    mode: HttpRewriteMode<'_>,
    host: Option<&str>,
) -> RewriteResult<BodyKind> {
    let mut content_length = None;
    let mut seen_content_length = false;
    let mut transfer_encoding_values = Vec::new();

    for header in &request.headers {
        if header.name.eq_ignore_ascii_case("content-length") {
            if seen_content_length {
                return Err(HttpRewriteError::denied(
                    mode,
                    DenyReason::MalformedHeaders,
                    None,
                    host,
                ));
            }
            seen_content_length = true;
            let value = std::str::from_utf8(&header.value).map_err(|_| {
                HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, host)
            })?;
            let parsed = value.trim().parse::<usize>().map_err(|_| {
                HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, host)
            })?;
            content_length = Some(parsed);
        } else if header.name.eq_ignore_ascii_case("transfer-encoding") {
            let value = std::str::from_utf8(&header.value).map_err(|_| {
                HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, host)
            })?;
            transfer_encoding_values.push(value.to_ascii_lowercase());
        }
    }

    if transfer_encoding_values.is_empty() {
        return Ok(content_length.map_or(BodyKind::None, BodyKind::ContentLength));
    }

    if content_length.is_some() {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::MalformedHeaders,
            None,
            host,
        ));
    }

    let tokens = transfer_encoding_values
        .iter()
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if tokens == ["chunked"] {
        Ok(BodyKind::Chunked)
    } else {
        Err(HttpRewriteError::denied(
            mode,
            DenyReason::MalformedHeaders,
            None,
            host,
        ))
    }
}

async fn forward_body<R, W>(
    reader: &mut BufferedReader<'_, R>,
    upstream: &mut W,
    body_kind: BodyKind,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    match body_kind {
        BodyKind::None => Ok(()),
        BodyKind::ContentLength(len) => forward_exact(reader, upstream, len, mode).await,
        BodyKind::Chunked => forward_chunked(reader, upstream, mode).await,
    }
}

async fn forward_exact<R, W>(
    reader: &mut BufferedReader<'_, R>,
    upstream: &mut W,
    mut remaining: usize,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut chunk = [0_u8; READ_CHUNK_BYTES];
    while remaining > 0 {
        if !reader.buffer.is_empty() {
            let to_write = remaining.min(reader.buffer.len());
            upstream
                .write_all(&reader.buffer[..to_write])
                .await
                .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
            reader.drain_front(to_write);
            remaining -= to_write;
            continue;
        }

        let to_read = remaining.min(chunk.len());
        let bytes_read = reader
            .inner
            .read(&mut chunk[..to_read])
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        if bytes_read == 0 {
            return Err(HttpRewriteError::denied(
                mode,
                DenyReason::MalformedHeaders,
                None,
                None,
            ));
        }
        upstream
            .write_all(&chunk[..bytes_read])
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        remaining -= bytes_read;
    }
    Ok(())
}

async fn forward_chunked<R, W>(
    reader: &mut BufferedReader<'_, R>,
    upstream: &mut W,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    loop {
        let line = reader.read_line(mode).await?;
        upstream
            .write_all(&line)
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        let chunk_size = parse_chunk_size(&line).map_err(|_| {
            HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None)
        })?;

        if chunk_size == 0 {
            loop {
                let trailer_line = reader.read_line(mode).await?;
                let done = trailer_line == b"\r\n";
                upstream
                    .write_all(&trailer_line)
                    .await
                    .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
                if done {
                    return Ok(());
                }
            }
        }

        forward_exact(reader, upstream, chunk_size + 2, mode).await?;
    }
}

fn parse_chunk_size(line: &[u8]) -> anyhow::Result<usize> {
    let text = std::str::from_utf8(line).context("chunk line is not utf8")?;
    let line_without_crlf = text
        .strip_suffix("\r\n")
        .ok_or_else(|| anyhow!("chunk line missing CRLF"))?;
    let size_text = line_without_crlf
        .split_once(';')
        .map_or(line_without_crlf, |(size, _)| size)
        .trim();
    usize::from_str_radix(size_text, 16).context("invalid chunk size")
}

async fn copy_raw_client_to_upstream<R, W>(
    reader: &mut BufferedReader<'_, R>,
    upstream: &mut W,
) -> RewriteResult<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    if !reader.buffer.is_empty() {
        upstream
            .write_all(&reader.buffer)
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        reader.buffer.clear();
    }
    tokio::io::copy(reader.inner, upstream)
        .await
        .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
    shutdown_upstream(upstream).await?;
    Ok(())
}

async fn shutdown_upstream<W>(upstream: &mut W) -> RewriteResult<()>
where
    W: AsyncWrite + Unpin,
{
    match upstream.shutdown().await {
        Ok(()) => Ok(()),
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::BrokenPipe | ErrorKind::ConnectionReset | ErrorKind::UnexpectedEof
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(HttpRewriteError::io(anyhow!(error))),
    }
}

fn is_websocket_upgrade(request: &RequestParts) -> bool {
    let has_upgrade_websocket = request.headers.iter().any(|header| {
        header.name.eq_ignore_ascii_case("upgrade")
            && header_value_eq_ascii(&header.value, "websocket")
    });
    let has_connection_upgrade = request.headers.iter().any(|header| {
        header.name.eq_ignore_ascii_case("connection")
            && header_tokens(&header.value).contains("upgrade")
    });

    has_upgrade_websocket && has_connection_upgrade
}

pub(super) async fn copy_responses_with_websocket_watch<R, W>(
    upstream: &mut R,
    client: &mut W,
    mut websocket_watch_rx: mpsc::Receiver<WebSocketUpgradeWatch>,
) -> Result<(), anyhow::Error>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut buffer = [0_u8; READ_CHUNK_BYTES];

    loop {
        tokio::select! {
            biased;

            maybe_watch = websocket_watch_rx.recv() => {
                let Some(watch) = maybe_watch else {
                    return copy_raw_response(upstream, client).await;
                };
                let accepted = forward_upgrade_response(upstream, client).await?;
                let _ = watch.accepted_tx.send(accepted);
                if accepted {
                    return copy_raw_response(upstream, client).await;
                }
            }
            bytes_read = upstream.read(&mut buffer) => {
                let bytes_read = match bytes_read {
                    Ok(bytes_read) => bytes_read,
                    Err(error)
                        if matches!(
                            error.kind(),
                            ErrorKind::BrokenPipe
                                | ErrorKind::ConnectionReset
                                | ErrorKind::UnexpectedEof
                        ) =>
                    {
                        return Ok(());
                    }
                    Err(error) => return Err(error.into()),
                };
                if bytes_read == 0 {
                    return Ok(());
                }
                client.write_all(&buffer[..bytes_read]).await?;
            }
        }
    }
}

async fn forward_upgrade_response<R, W>(upstream: &mut R, client: &mut W) -> anyhow::Result<bool>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut response = Vec::new();
    loop {
        if let Some(header_end) = find_subslice(&response, b"\r\n\r\n") {
            let header_len = header_end + 4;
            let accepted = is_switching_protocols_response(&response[..header_len]);
            client.write_all(&response).await?;
            return Ok(accepted);
        }

        if response.len() >= MAX_HEADER_BLOCK_BYTES {
            client.write_all(&response).await?;
            return Ok(false);
        }

        let mut chunk = [0_u8; READ_CHUNK_BYTES];
        let bytes_read = match upstream.read(&mut chunk).await {
            Ok(bytes_read) => bytes_read,
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::BrokenPipe | ErrorKind::ConnectionReset | ErrorKind::UnexpectedEof
                ) =>
            {
                if !response.is_empty() {
                    client.write_all(&response).await?;
                }
                return Ok(false);
            }
            Err(error) => return Err(error.into()),
        };
        if bytes_read == 0 {
            if !response.is_empty() {
                client.write_all(&response).await?;
            }
            return Ok(false);
        }
        response.extend_from_slice(&chunk[..bytes_read]);
    }
}

fn is_switching_protocols_response(bytes: &[u8]) -> bool {
    let mut headers = [httparse::EMPTY_HEADER; MAX_HEADERS];
    let mut response = httparse::Response::new(&mut headers);
    let Ok(status) = response.parse(bytes) else {
        return false;
    };
    if !status.is_complete() || response.code != Some(101) {
        return false;
    }

    let has_upgrade_websocket = response.headers.iter().any(|header| {
        header.name.eq_ignore_ascii_case("upgrade")
            && header_value_eq_ascii(header.value, "websocket")
    });
    let has_connection_upgrade = response.headers.iter().any(|header| {
        header.name.eq_ignore_ascii_case("connection")
            && header_tokens(header.value).contains("upgrade")
    });

    has_upgrade_websocket && has_connection_upgrade
}

async fn copy_raw_response<R, W>(upstream: &mut R, client: &mut W) -> anyhow::Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    match tokio::io::copy(upstream, client).await {
        Ok(_) => Ok(()),
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::BrokenPipe | ErrorKind::ConnectionReset | ErrorKind::UnexpectedEof
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(error.into()),
    }
}

fn header_value_eq_ascii(value: &[u8], expected: &str) -> bool {
    std::str::from_utf8(value)
        .map(|value| value.trim().eq_ignore_ascii_case(expected))
        .unwrap_or(false)
}

fn header_tokens(value: &[u8]) -> HashSet<String> {
    std::str::from_utf8(value)
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|token| !token.is_empty())
                .map(str::to_ascii_lowercase)
                .collect()
        })
        .unwrap_or_default()
}

fn normalize_host(value: &str, default_port: u16) -> Result<String, ()> {
    let value = value.trim().to_ascii_lowercase();
    let value = value.strip_suffix('.').unwrap_or(&value).to_string();
    if value.is_empty() {
        return Err(());
    }

    if let Some(rest) = value.strip_prefix('[') {
        let Some((inside, after_bracket)) = rest.split_once(']') else {
            return Err(());
        };
        if after_bracket.is_empty() {
            return Ok(inside.to_string());
        }
        let Some(port) = after_bracket.strip_prefix(':') else {
            return Err(());
        };
        return if port.parse::<u16>().ok() == Some(default_port) {
            Ok(inside.to_string())
        } else {
            Ok(format!("[{inside}]:{port}"))
        };
    }

    if value.matches(':').count() == 1 {
        let (host, port) = value.rsplit_once(':').ok_or(())?;
        return if port.parse::<u16>().ok() == Some(default_port) {
            Ok(host.strip_suffix('.').unwrap_or(host).to_string())
        } else if port.chars().all(|c| c.is_ascii_digit()) {
            Ok(format!("{}:{port}", host.strip_suffix('.').unwrap_or(host)))
        } else {
            Err(())
        };
    }

    Ok(value)
}

fn contains_placeholder(bytes: &[u8]) -> bool {
    let mut cursor = 0;
    while cursor + PLACEHOLDER_LEN <= bytes.len() {
        if bytes[cursor..].starts_with(PLACEHOLDER_PREFIX)
            && is_valid_placeholder_bytes(&bytes[cursor..cursor + PLACEHOLDER_LEN])
        {
            return true;
        }
        cursor += 1;
    }
    false
}

fn is_valid_placeholder_bytes(value: &[u8]) -> bool {
    value.len() == PLACEHOLDER_LEN
        && value.starts_with(PLACEHOLDER_PREFIX)
        && value.ends_with(PLACEHOLDER_SUFFIX)
        && value[PLACEHOLDER_PREFIX.len()..PLACEHOLDER_PREFIX.len() + 32]
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
}

fn is_definitely_non_http(bytes: &[u8]) -> bool {
    let Some(first) = bytes.first() else {
        return false;
    };
    !first.is_ascii_uppercase()
}

fn looks_like_http_request_line(bytes: &[u8]) -> bool {
    let Some(line_end) = find_subslice(bytes, b"\r\n") else {
        return bytes.first().is_some_and(u8::is_ascii_uppercase);
    };
    let Ok(line) = std::str::from_utf8(&bytes[..line_end]) else {
        return false;
    };
    let parts = line.split_whitespace().collect::<Vec<_>>();
    parts.len() == 3
        && parts[0].bytes().all(|byte| byte.is_ascii_uppercase())
        && parts[2].starts_with("HTTP/")
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use anyhow::{Context, Result};
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

    use crate::egress_secrets::{DomainSet, Secret};

    use super::*;

    const PLACEHOLDER: &str = "__DSEC_0123456789abcdef0123456789abcdef__";

    #[tokio::test]
    async fn substitutes_literal_header_values() -> Result<()> {
        let table = secret_table(
            "OPENAI_API_KEY",
            PLACEHOLDER,
            "sk-test",
            &["api.openai.com"],
        )?;
        let output = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Bearer __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;

        assert!(String::from_utf8(output)?.contains("Authorization: Bearer sk-test\r\n"));
        Ok(())
    }

    #[tokio::test]
    async fn substitutes_basic_auth_decoded_values() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real-secret", &["api.openai.com"])?;
        let token = general_purpose::STANDARD.encode(format!("user:{PLACEHOLDER}"));
        let request = format!(
            "GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Basic {token}\r\n\r\n"
        );

        let output = rewrite_once(
            request.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;
        let rewritten_token = text
            .lines()
            .find_map(|line| line.strip_prefix("Authorization: Basic "))
            .context("missing rewritten authorization header")?;
        let decoded = general_purpose::STANDARD.decode(rewritten_token)?;

        assert_eq!(decoded, b"user:real-secret");
        Ok(())
    }

    #[tokio::test]
    async fn handles_pipelined_content_length_requests() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let input = b"POST /one HTTP/1.1\r\nHost: api.openai.com\r\nContent-Length: 4\r\nX-Key: __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\nbodyGET /two HTTP/1.1\r\nHost: api.openai.com\r\nX-Key: __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n";
        let output = rewrite_once(
            input,
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.contains("POST /one HTTP/1.1\r\n"));
        assert!(text.contains("\r\n\r\nbodyGET /two HTTP/1.1\r\n"));
        assert_eq!(text.matches("X-Key: real").count(), 2);
        Ok(())
    }

    #[tokio::test]
    async fn drops_host_sni_mismatch() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: evil.example\r\nX-Key: __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("host mismatch should deny");

        assert_deny_reason(err, DenyReason::HostSniMismatch);
        Ok(())
    }

    #[tokio::test]
    async fn drops_duplicate_host_headers() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nHost: api.openai.com\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("duplicate Host should deny");

        assert_deny_reason(err, DenyReason::DuplicateHost);
        Ok(())
    }

    #[tokio::test]
    async fn drops_placeholder_in_url_line() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let err = rewrite_once(
            b"GET /?key=__DSEC_0123456789abcdef0123456789abcdef__ HTTP/1.1\r\nHost: api.openai.com\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("URL placeholder should deny");

        assert_deny_reason(err, DenyReason::UrlLinePlaceholder);
        Ok(())
    }

    #[tokio::test]
    async fn drops_absolute_uri_authority_mismatch() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let err = rewrite_once(
            b"GET https://evil.example/ HTTP/1.1\r\nHost: api.openai.com\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("absolute URI authority mismatch should deny");

        assert_deny_reason(err, DenyReason::AbsoluteUriAuthorityMismatch);
        Ok(())
    }

    #[tokio::test]
    async fn drops_unknown_placeholders() -> Result<()> {
        let table = SecretTable::default();
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nX-Key: __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("unknown placeholder should deny");

        assert_deny_reason(err, DenyReason::PlaceholderOnNonAllowed);
        Ok(())
    }

    #[tokio::test]
    async fn drops_secret_values_with_control_chars() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "bad\nvalue", &["api.openai.com"])?;
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nX-Key: __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("control chars should deny");

        assert_deny_reason(err, DenyReason::ValueControlChar);
        Ok(())
    }

    #[tokio::test]
    async fn drops_headers_that_exceed_size_after_substitution() -> Result<()> {
        let huge_value = "x".repeat(MAX_HEADER_LINE_BYTES);
        let table = secret_table("API_KEY", PLACEHOLDER, &huge_value, &["api.openai.com"])?;
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nX-Key: __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("oversized rewritten header should deny");

        assert_deny_reason(err, DenyReason::HeaderSizeExceeded);
        Ok(())
    }

    #[tokio::test]
    async fn drops_plain_http_placeholder() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nX-Key: __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n",
            &table,
            HttpRewriteMode::PlainHttp {
                domain: "api.openai.com",
            },
        )
        .await
        .expect_err("plain HTTP placeholder should deny");

        assert_deny_reason(err, DenyReason::Port80Placeholder);
        Ok(())
    }

    #[tokio::test]
    async fn drops_plain_http_literal_placeholder_in_invalid_basic_auth() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Basic __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n",
            &table,
            HttpRewriteMode::PlainHttp {
                domain: "api.openai.com",
            },
        )
        .await
        .expect_err("plain HTTP literal placeholder should deny even in invalid Basic auth");

        assert_deny_reason(err, DenyReason::Port80Placeholder);
        Ok(())
    }

    #[tokio::test]
    async fn substitutes_tls_literal_placeholder_in_invalid_basic_auth() -> Result<()> {
        // Regression: when base64 decode of a `Basic` value fails we must still
        // run the general substitution on the raw header bytes, otherwise a
        // known placeholder silently ships to upstream un-rewritten on TLS.
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let output = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Basic __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.contains("Authorization: Basic real\r\n"));
        assert!(!text.contains(PLACEHOLDER));
        Ok(())
    }

    #[tokio::test]
    async fn copies_non_http_tls_bytes_unchanged() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "real", &["api.openai.com"])?;
        let output = rewrite_once(
            b"\x00\x00\x00\x08postgres",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;

        assert_eq!(output, b"\x00\x00\x00\x08postgres");
        Ok(())
    }

    #[tokio::test]
    async fn websocket_upgrade_headers_are_rewritten_before_raw_splice() -> Result<()> {
        let table = secret_table("API_KEY", PLACEHOLDER, "realtime-key", &["api.openai.com"])?;
        let output = rewrite_once(
            b"GET /realtime HTTP/1.1\r\nHost: api.openai.com\r\nConnection: keep-alive, Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Protocol: __DSEC_0123456789abcdef0123456789abcdef__\r\n\r\nraw-frame",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.contains("Sec-WebSocket-Protocol: realtime-key\r\n"));
        assert!(text.ends_with("\r\n\r\nraw-frame"));
        Ok(())
    }

    #[tokio::test]
    async fn response_watch_switches_to_raw_copy_after_websocket_101() -> Result<()> {
        let (mut upstream_write, mut upstream_read) = tokio::io::duplex(16 * 1024);
        let (mut client_write, mut client_read) = tokio::io::duplex(16 * 1024);
        let (watch_tx, watch_rx) = mpsc::channel(1);
        let response_task = tokio::spawn(async move {
            copy_responses_with_websocket_watch(&mut upstream_read, &mut client_write, watch_rx)
                .await
        });

        let (accepted_tx, accepted_rx) = oneshot::channel();
        watch_tx
            .send(WebSocketUpgradeWatch { accepted_tx })
            .await
            .context("watch send should succeed")?;
        upstream_write
            .write_all(
                b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nraw-frame",
            )
            .await?;
        upstream_write.shutdown().await?;

        let accepted = match accepted_rx.await {
            Ok(accepted) => accepted,
            Err(error) => {
                let task_result = response_task.await;
                panic!("accepted response dropped ({error}); response task: {task_result:?}");
            }
        };
        assert!(accepted);
        response_task.await??;

        let mut output = Vec::new();
        client_read.read_to_end(&mut output).await?;
        assert_eq!(
            output,
            b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nraw-frame"
        );
        Ok(())
    }

    #[test]
    fn normalizes_host_for_default_ports() -> Result<()> {
        assert_eq!(
            normalize_host("API.OpenAI.COM.:443", 443).ok(),
            Some("api.openai.com".to_string())
        );
        assert_eq!(
            normalize_host("api.openai.com:8443", 443).ok(),
            Some("api.openai.com:8443".to_string())
        );
        Ok(())
    }

    async fn rewrite_once(
        input: &[u8],
        table: &SecretTable,
        mode: HttpRewriteMode<'_>,
    ) -> std::result::Result<Vec<u8>, HttpRewriteError> {
        let (mut client_write, mut client_read) = tokio::io::duplex(16 * 1024);
        let (mut upstream_write, mut upstream_read) = tokio::io::duplex(16 * 1024);
        client_write
            .write_all(input)
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        client_write
            .shutdown()
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;

        forward_http1_requests(&mut client_read, &mut upstream_write, table, mode, None).await?;
        drop(upstream_write);

        let mut output = Vec::new();
        upstream_read
            .read_to_end(&mut output)
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        Ok(output)
    }

    fn secret_table(
        name: &str,
        placeholder: &str,
        value: &str,
        allowed_domains: &[&str],
    ) -> Result<SecretTable> {
        let allowed_domain_strings = allowed_domains
            .iter()
            .map(|domain| (*domain).to_string())
            .collect::<Vec<_>>();
        let allowed_domains = DomainSet::from_patterns(&allowed_domain_strings)?;
        let secret = Secret {
            name: name.to_string(),
            placeholder: placeholder.to_string(),
            value: value.to_string(),
            allowed_domains,
        };
        let mut by_placeholder = HashMap::new();
        by_placeholder.insert(placeholder.to_string(), secret);
        Ok(SecretTable {
            by_placeholder,
            sni_match_set: DomainSet::from_patterns(&allowed_domain_strings)?,
        })
    }

    fn assert_deny_reason(error: HttpRewriteError, expected: DenyReason) {
        match error {
            HttpRewriteError::Denied(entry) => assert_eq!(entry.reason, expected),
            HttpRewriteError::Io(error) => panic!("expected deny, got IO error: {error}"),
        }
    }
}
