use std::collections::HashSet;
use std::fmt;
use std::io::ErrorKind;

use anyhow::{anyhow, Context};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot};

use crate::egress_secrets::SecretTable;

use super::deny_log::{DenyLogEntry, DenyReason};

// Limits are intentionally generous compared to nginx/Apache defaults
// (~8-32 KiB / ~100 headers). This rewriter sits in front of arbitrary
// outbound HTTP traffic from the sandbox (curl, git, package managers,
// browsers, anything), so the role of these limits is to bound our own
// memory use and reject obviously-malformed traffic, not to enforce a
// policy on what the destination accepts.
const MAX_HEADER_BLOCK_BYTES: usize = 64 * 1024;
const MAX_HEADER_LINE_BYTES: usize = 16 * 1024;
const MAX_HEADERS: usize = 256;
const READ_CHUNK_BYTES: usize = 8 * 1024;
const NON_HTTP_FALLBACK_BYTES: usize = 4 * 1024;
const MAX_CHUNK_LINE_BYTES: usize = 8 * 1024;
const MAX_TRAILER_BLOCK_BYTES: usize = 64 * 1024;

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
}

#[derive(Debug)]
pub(super) enum HttpRewriteError {
    Denied(DenyLogEntry),
    Io(anyhow::Error),
}

// Kept for API stability with the response-side websocket coordination that
// lands in a follow-up PR. Nothing here sends on `accepted_tx` yet; the
// upgrade path simply splices raw bytes once the request is forwarded.
#[allow(dead_code)]
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

    fn denied(mode: HttpRewriteMode<'_>, reason: DenyReason, host: Option<&str>) -> Self {
        Self::Denied(DenyLogEntry::mitm(
            reason,
            mode.domain(),
            mode.port(),
            None,
            mode.sni(),
            host,
        ))
    }
}

type RewriteResult<T> = std::result::Result<T, HttpRewriteError>;

pub(super) async fn forward_http1_requests<R, W>(
    client: &mut R,
    upstream: &mut W,
    _secret_table: &SecretTable,
    mode: HttpRewriteMode<'_>,
    _websocket_watch_tx: Option<&mpsc::Sender<WebSocketUpgradeWatch>>,
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
                // The trust boundary is the SNI/TCP layer, not HTTP: the
                // nftables redirect and the SNI gate have already pinned the
                // upstream TCP destination to an allowlisted domain. When the
                // first bytes inside the MITM'd TLS stream don't look like
                // HTTP (postgres-over-TLS, a custom binary protocol over 443,
                // etc.), there's nothing for us to parse or rewrite, so we
                // splice the rest of the connection raw. The bytes still flow
                // only to the allowlisted upstream that the SNI gate
                // approved.
                copy_raw_client_to_upstream(&mut reader, upstream).await?;
                return Ok(());
            }
            HeaderRead::Header(header_len) => header_len,
        };

        let request = parse_request(&reader.buffer[..header_len], mode)?;
        parsed_first_http_request = true;
        let processed = process_request(&request, mode)?;

        reader.drain_front(header_len);
        upstream
            .write_all(&processed.header_bytes)
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        forward_body(&mut reader, upstream, processed.body_kind, mode).await?;

        if processed.websocket_upgrade {
            // After a WebSocket upgrade request, the client switches to raw
            // frames. The response-side 101 sniff and accept/reject path
            // lands in a follow-up PR; here we splice the rest of the
            // connection and let the response copier ship the 101 (or any
            // other status) back unmodified.
            copy_raw_client_to_upstream(&mut reader, upstream).await?;
            return Ok(());
        }
    }
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
                    ));
                }
                return Ok(HeaderRead::Header(header_len));
            }

            if self.buffer.len() >= MAX_HEADER_BLOCK_BYTES {
                return Err(HttpRewriteError::denied(
                    mode,
                    DenyReason::MalformedHeaders,
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
        .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None))?;

    if !status.is_complete() {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::MalformedHeaders,
            None,
        ));
    }

    let method = request
        .method
        .ok_or_else(|| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None))?;
    let uri = request
        .path
        .ok_or_else(|| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None))?;
    let version = request
        .version
        .ok_or_else(|| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None))?;

    if version != 1 {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::MalformedHeaders,
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
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<ProcessedRequest> {
    // CONNECT requests-inside an already-established session ask the receiver
    // to act as a tunneling proxy. The upstream TCP destination is pinned to
    // the SNI/domain that gated this session, so forwarding CONNECT to it
    // would never establish a real tunnel. We deny up front rather than
    // forward nonsense bytes that future refactors might start honoring.
    if request.method.eq_ignore_ascii_case("CONNECT") {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::ConnectMethodForbidden,
            None,
        ));
    }

    let host = normalized_single_host(request, mode)?;
    validate_absolute_uri_authority(&request.uri, &host, mode)?;

    let mut header_bytes = Vec::new();
    header_bytes.extend_from_slice(request.method.as_bytes());
    header_bytes.extend_from_slice(b" ");
    header_bytes.extend_from_slice(request.uri.as_bytes());
    header_bytes.extend_from_slice(b" HTTP/1.1\r\n");

    let body_kind = body_kind(request, mode, Some(&host))?;
    let websocket_upgrade = is_websocket_upgrade(request);

    for header in &request.headers {
        let line_len = header.name.len() + 2 + header.value.len() + 2;
        if line_len > MAX_HEADER_LINE_BYTES {
            return Err(HttpRewriteError::denied(
                mode,
                DenyReason::HeaderSizeExceeded,
                Some(&host),
            ));
        }

        header_bytes.extend_from_slice(header.name.as_bytes());
        header_bytes.extend_from_slice(b": ");
        header_bytes.extend_from_slice(&header.value);
        header_bytes.extend_from_slice(b"\r\n");
    }

    header_bytes.extend_from_slice(b"\r\n");
    if header_bytes.len() > MAX_HEADER_BLOCK_BYTES {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::HeaderSizeExceeded,
            Some(&host),
        ));
    }

    Ok(ProcessedRequest {
        header_bytes,
        body_kind,
        websocket_upgrade,
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
        ));
    }
    if hosts.len() > 1 {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::DuplicateHost,
            None,
        ));
    }

    let host_value = std::str::from_utf8(&hosts[0].value)
        .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None))?;
    let host = normalize_host(host_value, mode.port())
        .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None))?;

    if let HttpRewriteMode::Tls { sni } = mode {
        let normalized_sni = normalize_host(sni, 443).map_err(|_| {
            HttpRewriteError::denied(mode, DenyReason::HostSniMismatch, Some(&host))
        })?;
        if normalized_sni != host {
            return Err(HttpRewriteError::denied(
                mode,
                DenyReason::HostSniMismatch,
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
        HttpRewriteError::denied(mode, DenyReason::AbsoluteUriAuthorityMismatch, Some(host))
    })?;
    // `host` was already verified to equal SNI by `normalized_single_host` in
    // TLS mode, so comparing `normalized_authority == host` is sufficient.
    if normalized_authority != host {
        return Err(HttpRewriteError::denied(
            mode,
            DenyReason::AbsoluteUriAuthorityMismatch,
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
                    host,
                ));
            }
            seen_content_length = true;
            let value = std::str::from_utf8(&header.value)
                .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, host))?;
            let parsed = value
                .trim()
                .parse::<usize>()
                .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, host))?;
            content_length = Some(parsed);
        } else if header.name.eq_ignore_ascii_case("transfer-encoding") {
            let value = std::str::from_utf8(&header.value)
                .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, host))?;
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
        let chunk_size = parse_chunk_size(&line)
            .map_err(|_| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None))?;

        if chunk_size == 0 {
            let mut trailer_bytes = 0_usize;
            loop {
                let trailer_line = reader.read_line(mode).await?;
                trailer_bytes = trailer_bytes
                    .checked_add(trailer_line.len())
                    .filter(|total| *total <= MAX_TRAILER_BLOCK_BYTES)
                    .ok_or_else(|| {
                        HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None)
                    })?;
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

        let chunk_with_crlf = chunk_size
            .checked_add(2)
            .ok_or_else(|| HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None))?;
        forward_exact(reader, upstream, chunk_with_crlf, mode).await?;
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
    _websocket_watch_rx: mpsc::Receiver<WebSocketUpgradeWatch>,
) -> Result<(), anyhow::Error>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    // Responses are streamed through unmodified. The follow-up PR adds a 101
    // sniff that consumes the watch channel to gate raw splice once both
    // sides have agreed on the WebSocket upgrade.
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

    use anyhow::Result;
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

    use crate::egress_secrets::DomainSet;

    use super::*;

    #[tokio::test]
    async fn forwards_get_request_unchanged() -> Result<()> {
        let table = empty_table()?;
        let output = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Bearer real-secret\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.starts_with("GET / HTTP/1.1\r\n"));
        assert!(text.contains("Host: api.openai.com\r\n"));
        assert!(text.contains("Authorization: Bearer real-secret\r\n"));
        Ok(())
    }

    #[tokio::test]
    async fn forwards_pipelined_content_length_requests() -> Result<()> {
        let table = empty_table()?;
        let input = b"POST /one HTTP/1.1\r\nHost: api.openai.com\r\nContent-Length: 4\r\n\r\nbodyGET /two HTTP/1.1\r\nHost: api.openai.com\r\n\r\n";
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
        Ok(())
    }

    #[tokio::test]
    async fn forwards_chunked_body() -> Result<()> {
        let table = empty_table()?;
        let input = b"POST /upload HTTP/1.1\r\nHost: api.openai.com\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n";
        let output = rewrite_once(
            input,
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(text.contains("5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n"));
        Ok(())
    }

    #[tokio::test]
    async fn drops_host_sni_mismatch() -> Result<()> {
        let table = empty_table()?;
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: evil.example\r\n\r\n",
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
        let table = empty_table()?;
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
    async fn drops_missing_host_header() -> Result<()> {
        let table = empty_table()?;
        let err = rewrite_once(
            b"GET / HTTP/1.1\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("missing Host should deny");

        assert_deny_reason(err, DenyReason::MissingHost);
        Ok(())
    }

    #[tokio::test]
    async fn drops_absolute_uri_authority_mismatch() -> Result<()> {
        let table = empty_table()?;
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
    async fn drops_oversized_header_line() -> Result<()> {
        let table = empty_table()?;
        let huge_value = "x".repeat(MAX_HEADER_LINE_BYTES);
        let input =
            format!("GET / HTTP/1.1\r\nHost: api.openai.com\r\nX-Big: {huge_value}\r\n\r\n");
        let err = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("oversized header should deny");

        assert_deny_reason(err, DenyReason::HeaderSizeExceeded);
        Ok(())
    }

    #[tokio::test]
    async fn copies_non_http_tls_bytes_unchanged() -> Result<()> {
        let table = empty_table()?;
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
    async fn drops_content_length_and_transfer_encoding_together() -> Result<()> {
        // Smuggling regression: a fronting proxy that honors CL while we
        // honor TE (or vice versa) is exactly the split this denies.
        let table = empty_table()?;
        let err = rewrite_once(
            b"POST / HTTP/1.1\r\nHost: api.openai.com\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("CL + TE conflict should deny");

        assert_deny_reason(err, DenyReason::MalformedHeaders);
        Ok(())
    }

    #[tokio::test]
    async fn drops_duplicate_content_length() -> Result<()> {
        let table = empty_table()?;
        let err = rewrite_once(
            b"POST / HTTP/1.1\r\nHost: api.openai.com\r\nContent-Length: 5\r\nContent-Length: 5\r\n\r\nhello",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("duplicate Content-Length should deny");

        assert_deny_reason(err, DenyReason::MalformedHeaders);
        Ok(())
    }

    #[tokio::test]
    async fn drops_transfer_encoding_with_non_chunked_token() -> Result<()> {
        // Anything other than the single token `chunked` is denied so we
        // never have to interpret gzip/deflate/identity layers on the
        // request body.
        let table = empty_table()?;
        let err = rewrite_once(
            b"POST / HTTP/1.1\r\nHost: api.openai.com\r\nTransfer-Encoding: chunked, gzip\r\n\r\n0\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("TE list with non-chunked token should deny");

        assert_deny_reason(err, DenyReason::MalformedHeaders);
        Ok(())
    }

    #[tokio::test]
    async fn drops_connect_method() -> Result<()> {
        let table = empty_table()?;
        let err = rewrite_once(
            b"CONNECT api.openai.com:443 HTTP/1.1\r\nHost: api.openai.com\r\n\r\n",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("CONNECT should deny");

        assert_deny_reason(err, DenyReason::ConnectMethodForbidden);
        Ok(())
    }

    #[tokio::test]
    async fn forwards_plain_http_request_unchanged() -> Result<()> {
        let table = empty_table()?;
        let output = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Bearer real-secret\r\n\r\n",
            &table,
            HttpRewriteMode::PlainHttp {
                domain: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.starts_with("GET / HTTP/1.1\r\n"));
        assert!(text.contains("Host: api.openai.com\r\n"));
        assert!(text.contains("Authorization: Bearer real-secret\r\n"));
        Ok(())
    }

    #[tokio::test]
    async fn forwards_plain_http_with_non_default_port_in_host() -> Result<()> {
        let table = empty_table()?;
        let output = rewrite_once(
            b"GET / HTTP/1.1\r\nHost: api.openai.com:8080\r\n\r\n",
            &table,
            HttpRewriteMode::PlainHttp {
                domain: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.contains("Host: api.openai.com:8080\r\n"));
        Ok(())
    }

    #[tokio::test]
    async fn splices_raw_after_websocket_upgrade_request() -> Result<()> {
        let table = empty_table()?;
        let output = rewrite_once(
            b"GET /realtime HTTP/1.1\r\nHost: api.openai.com\r\nConnection: keep-alive, Upgrade\r\nUpgrade: websocket\r\n\r\nraw-frame",
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.contains("Upgrade: websocket\r\n"));
        assert!(text.ends_with("\r\n\r\nraw-frame"));
        Ok(())
    }

    #[test]
    fn normalizes_host_for_default_ports() {
        assert_eq!(
            normalize_host("API.OpenAI.COM.:443", 443).ok(),
            Some("api.openai.com".to_string())
        );
        assert_eq!(
            normalize_host("api.openai.com:8443", 443).ok(),
            Some("api.openai.com:8443".to_string())
        );
    }

    async fn rewrite_once(
        input: &[u8],
        table: &SecretTable,
        mode: HttpRewriteMode<'_>,
    ) -> std::result::Result<Vec<u8>, HttpRewriteError> {
        let (mut client_write, mut client_read) = tokio::io::duplex(16 * 1024);
        let (mut upstream_write, mut upstream_read) = tokio::io::duplex(16 * 1024);
        // The duplex pipe is intentionally smaller than some test inputs, so
        // run the writer as a task that can yield while the rewriter drains
        // the read side.
        let input = input.to_vec();
        let writer_task = tokio::spawn(async move {
            client_write.write_all(&input).await?;
            client_write.shutdown().await?;
            Ok::<(), std::io::Error>(())
        });

        let rewrite_result =
            forward_http1_requests(&mut client_read, &mut upstream_write, table, mode, None).await;
        drop(upstream_write);
        // Drop client_read so a writer task still trying to push the tail of
        // an oversized input fails fast with BrokenPipe instead of hanging
        // on the duplex backpressure.
        drop(client_read);

        let writer_result = writer_task
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        if let Err(error) = writer_result {
            // Broken pipe is expected when the rewriter denies before draining
            // the full input; surface other errors so the test sees them.
            if !matches!(
                error.kind(),
                ErrorKind::BrokenPipe | ErrorKind::ConnectionReset | ErrorKind::UnexpectedEof
            ) {
                return Err(HttpRewriteError::io(anyhow!(error)));
            }
        }

        rewrite_result?;

        let mut output = Vec::new();
        upstream_read
            .read_to_end(&mut output)
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        Ok(output)
    }

    fn empty_table() -> Result<SecretTable> {
        Ok(SecretTable {
            by_placeholder: HashMap::new(),
            sni_match_set: DomainSet::from_patterns(&[])?,
        })
    }

    fn assert_deny_reason(error: HttpRewriteError, expected: DenyReason) {
        match error {
            HttpRewriteError::Denied(entry) => assert_eq!(entry.reason, expected),
            HttpRewriteError::Io(error) => panic!("expected deny, got IO error: {error}"),
        }
    }
}
