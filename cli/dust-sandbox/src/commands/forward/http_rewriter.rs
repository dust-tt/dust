use std::collections::HashSet;
use std::fmt;
use std::io::ErrorKind;

use anyhow::anyhow;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot};

use crate::egress_secrets::SecretTable;

use super::deny_log::{DenyLogEntry, DenyReason};
use super::http_framing::{
    find_subslice, parse_chunk_size, MAX_HEADER_BLOCK_BYTES, MAX_HEADER_LINE_BYTES,
    MAX_TRAILER_BLOCK_BYTES, READ_CHUNK_BYTES,
};
use super::rewrite_policy::{
    deny_entry, normalize_host, normalized_authority, rewrite_request_headers,
    validate_request_line_policy, Authority, HeaderPart, RequestParts,
    RewriteMode as HttpRewriteMode,
};

const MAX_HEADERS: usize = 256;
const NON_HTTP_FALLBACK_BYTES: usize = 4 * 1024;
const MAX_CHUNK_LINE_BYTES: usize = 8 * 1024;
// Cap how many bytes we stage while waiting for a CRLF on the upstream
// response status line. A real `HTTP/1.x NNN ...` line is well under a few
// hundred bytes; well past that we treat the upstream as non-HTTP and stop
// sniffing rather than buffer responses indefinitely.
const MAX_STATUS_LINE_BYTES: usize = 16 * 1024;

#[derive(Debug)]
pub(super) enum HttpRewriteError {
    Denied(DenyLogEntry),
    Io(anyhow::Error),
}

// Sent by the request task to the response task after forwarding a WebSocket
// upgrade request. The response task sniffs the next response status line,
// signals back through `accepted_tx` whether the upstream replied with 101
// Switching Protocols, and the request task uses that signal to decide
// whether to splice raw client->upstream frames (101) or tear the upstream
// write half down (non-101). The channel is `oneshot` because each upgrade
// request gets exactly one verdict.
pub(super) struct WebSocketUpgradeWatch {
    pub accepted_tx: oneshot::Sender<bool>,
}

enum UpgradeVerdict {
    NotAnUpgrade,
    AwaitingResponse(oneshot::Receiver<bool>),
    ResponseTaskGone,
}

async fn register_upgrade_verdict(
    websocket_watch_tx: &mpsc::Sender<WebSocketUpgradeWatch>,
) -> UpgradeVerdict {
    let (accepted_tx, accepted_rx) = oneshot::channel();
    if websocket_watch_tx
        .send(WebSocketUpgradeWatch { accepted_tx })
        .await
        .is_err()
    {
        UpgradeVerdict::ResponseTaskGone
    } else {
        UpgradeVerdict::AwaitingResponse(accepted_rx)
    }
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
        Self::Denied(deny_entry(mode, reason, secret_name, host))
    }
}

type RewriteResult<T> = std::result::Result<T, HttpRewriteError>;

pub(super) async fn forward_http1_requests<R, W>(
    client: &mut R,
    upstream: &mut W,
    secret_table: &SecretTable,
    mode: HttpRewriteMode<'_>,
    websocket_watch_tx: &mpsc::Sender<WebSocketUpgradeWatch>,
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
        let processed = process_request(&request, secret_table, mode)?;

        // For a WebSocket upgrade we register the response-side sniff BEFORE
        // forwarding any bytes so the response task is already in sniff mode
        // by the time upstream's 101 (or non-101) reply arrives. Doing it
        // after forwarding would race in-flight upstream bytes against the
        // mpsc::send and the sniff could land on the wrong status line.
        let upgrade_verdict = if processed.websocket_upgrade {
            register_upgrade_verdict(websocket_watch_tx).await
        } else {
            UpgradeVerdict::NotAnUpgrade
        };

        reader.drain_front(header_len);
        upstream
            .write_all(&processed.header_bytes)
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
        forward_body(&mut reader, upstream, processed.body_kind, mode).await?;

        match upgrade_verdict {
            UpgradeVerdict::NotAnUpgrade => continue,
            UpgradeVerdict::AwaitingResponse(accepted_rx) => {
                if accepted_rx.await.unwrap_or(false) {
                    copy_raw_client_to_upstream(&mut reader, upstream).await?;
                } else {
                    shutdown_upstream(upstream).await?;
                }
                return Ok(());
            }
            UpgradeVerdict::ResponseTaskGone => {
                // The response task has already exited (channel send failed),
                // so we can't learn the 101 verdict. Tear down rather than
                // splice raw frames into a half-closed connection.
                shutdown_upstream(upstream).await?;
                return Ok(());
            }
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
        target: uri.to_string(),
        headers,
    })
}

fn process_request(
    request: &RequestParts,
    secret_table: &SecretTable,
    mode: HttpRewriteMode<'_>,
) -> RewriteResult<ProcessedRequest> {
    let request_line = format!("{} {} HTTP/1.1", request.method, request.target);
    validate_request_line_policy(request, mode).map_err(HttpRewriteError::Denied)?;
    let host = normalized_authority(request, Authority::HostHeader, mode)
        .map_err(HttpRewriteError::Denied)?;
    validate_absolute_uri_authority(&request.target, &host, mode)?;

    let mut header_bytes = Vec::new();
    header_bytes.extend_from_slice(request_line.as_bytes());
    header_bytes.extend_from_slice(b"\r\n");

    let body_kind = body_kind(request, mode, Some(&host))?;
    let websocket_upgrade = is_websocket_upgrade(request);
    let rewritten_headers = rewrite_request_headers(request, &host, secret_table, mode)
        .map_err(HttpRewriteError::Denied)?;

    for header in &rewritten_headers {
        let line_len = header.name.len() + 2 + header.value.len() + 2;
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
        header_bytes.extend_from_slice(&header.value);
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
            let mut trailer_bytes = 0_usize;
            loop {
                let trailer_line = reader.read_line(mode).await?;
                trailer_bytes = trailer_bytes
                    .checked_add(trailer_line.len())
                    .filter(|total| *total <= MAX_TRAILER_BLOCK_BYTES)
                    .ok_or_else(|| {
                        HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None)
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

        let chunk_with_crlf = chunk_size.checked_add(2).ok_or_else(|| {
            HttpRewriteError::denied(mode, DenyReason::MalformedHeaders, None, None)
        })?;
        forward_exact(reader, upstream, chunk_with_crlf, mode).await?;
    }
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
    // Responses are streamed through unmodified except when the request task
    // forwarded a WebSocket upgrade. In that case it sends a
    // `WebSocketUpgradeWatch` over the channel, and we sniff the next
    // response status line: a 101 reply means the upgrade was accepted and
    // raw frames will flow afterward; anything else means upstream rejected
    // it. Either way we forward the bytes we read and keep copying.
    //
    // This assumes no HTTP/1.1 pipelining (i.e. the upgrade request is the
    // only one in flight when its response arrives). Clients in the wild that
    // pipeline a regular request before an upgrade on the same connection are
    // essentially unheard of, so we don't try to track per-response framing
    // here.
    let mut buffer = vec![0_u8; READ_CHUNK_BYTES];
    let mut sniff_state: Option<UpgradeSniffState> = None;
    let mut watch_closed = false;

    loop {
        tokio::select! {
            biased;

            watch = websocket_watch_rx.recv(), if sniff_state.is_none() && !watch_closed => {
                match watch {
                    Some(watch) => {
                        sniff_state = Some(UpgradeSniffState {
                            accepted_tx: watch.accepted_tx,
                            staged: Vec::new(),
                        });
                    }
                    None => {
                        watch_closed = true;
                    }
                }
            }

            read_result = upstream.read(&mut buffer) => {
                let bytes_read = match read_result {
                    Ok(bytes_read) => bytes_read,
                    Err(error)
                        if matches!(
                            error.kind(),
                            ErrorKind::BrokenPipe
                                | ErrorKind::ConnectionReset
                                | ErrorKind::UnexpectedEof,
                        ) =>
                    {
                        if let Some(state) = sniff_state.take() {
                            let _ = state.accepted_tx.send(false);
                            if !state.staged.is_empty() {
                                client.write_all(&state.staged).await?;
                            }
                        }
                        return Ok(());
                    }
                    Err(error) => {
                        if let Some(state) = sniff_state.take() {
                            let _ = state.accepted_tx.send(false);
                        }
                        return Err(error.into());
                    }
                };

                if bytes_read == 0 {
                    if let Some(state) = sniff_state.take() {
                        let _ = state.accepted_tx.send(false);
                        if !state.staged.is_empty() {
                            client.write_all(&state.staged).await?;
                        }
                    }
                    return Ok(());
                }

                if let Some(mut state) = sniff_state.take() {
                    state.staged.extend_from_slice(&buffer[..bytes_read]);
                    if let Some(line_end) = find_subslice(&state.staged, b"\r\n") {
                        let is_101 = is_switching_protocols_response(&state.staged[..line_end]);
                        let _ = state.accepted_tx.send(is_101);
                        client.write_all(&state.staged).await?;
                    } else if state.staged.len() > MAX_STATUS_LINE_BYTES {
                        // No CRLF in 16 KiB: upstream sent something that
                        // isn't a status line. Treat as not-101 and flush the
                        // bytes through so the agent sees whatever upstream
                        // actually returned.
                        let _ = state.accepted_tx.send(false);
                        client.write_all(&state.staged).await?;
                    } else {
                        sniff_state = Some(state);
                    }
                } else {
                    client.write_all(&buffer[..bytes_read]).await?;
                }
            }
        }
    }
}

struct UpgradeSniffState {
    accepted_tx: oneshot::Sender<bool>,
    staged: Vec<u8>,
}

fn is_switching_protocols_response(status_line: &[u8]) -> bool {
    // We only look at the very first status line. A WebSocket upgrade request
    // does not include Expect: 100-continue, so a preceding `100 Continue`
    // interim response should not occur in practice. If it ever does we treat
    // it as not-101, the verdict is `rejected`, and we forward the bytes
    // unchanged; clients see the real upstream reply either way.
    let Ok(text) = std::str::from_utf8(status_line) else {
        return false;
    };
    let rest = match text.strip_prefix("HTTP/1.1 ") {
        Some(rest) => rest,
        None => match text.strip_prefix("HTTP/1.0 ") {
            Some(rest) => rest,
            None => return false,
        },
    };
    rest.split_whitespace().next() == Some("101")
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

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

    use crate::egress_secrets::DomainSet;
    use base64::{engine::general_purpose, Engine as _};

    use super::super::test_support::{empty_table, secret_table_with_secret};
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

    #[tokio::test]
    async fn substitutes_placeholder_in_header_value() -> Result<()> {
        let placeholder = "__DSEC_0123456789abcdef0123456789abcdef__";
        let table = secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &["api.openai.com"],
        )?;
        let input = format!(
            "GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Bearer {placeholder}\r\n\r\n"
        );

        let output = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.contains("Authorization: Bearer sk-real\r\n"));
        assert!(!text.contains(placeholder));
        Ok(())
    }

    #[tokio::test]
    async fn substitutes_placeholder_inside_basic_auth_base64() -> Result<()> {
        let placeholder = "__DSEC_aabbccddeeff00112233445566778899__";
        let table = secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &["api.openai.com"],
        )?;
        let encoded = general_purpose::STANDARD.encode(format!("user:{placeholder}"));
        let input = format!(
            "GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Basic {encoded}\r\n\r\n"
        );

        let output = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;
        let expected = general_purpose::STANDARD.encode("user:sk-real");

        assert!(
            text.contains(&format!("Authorization: Basic {expected}\r\n")),
            "expected re-encoded credential, got: {text}"
        );
        assert!(!text.contains(placeholder));
        Ok(())
    }

    #[tokio::test]
    async fn substitutes_multiple_placeholders_in_one_value() -> Result<()> {
        let placeholder = "__DSEC_11111111111111112222222222222222__";
        let table = secret_table_with_secret("X", placeholder, "AB", &["api.openai.com"])?;
        let input = format!(
            "GET / HTTP/1.1\r\nHost: api.openai.com\r\nX-Header: {placeholder}-and-{placeholder}\r\n\r\n"
        );

        let output = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;

        assert!(text.contains("X-Header: AB-and-AB\r\n"));
        Ok(())
    }

    #[tokio::test]
    async fn denies_unknown_placeholder_in_header_value() -> Result<()> {
        let table = secret_table_with_secret(
            "OTHER",
            "__DSEC_ffffffffffffffffffffffffffffffff__",
            "sk-other",
            &["api.openai.com"],
        )?;
        let unknown = "__DSEC_99999999999999999999999999999999__";
        let input = format!(
            "GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Bearer {unknown}\r\n\r\n"
        );

        let error = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("unknown placeholder should be denied");
        assert_deny_reason(error, DenyReason::PlaceholderOnNonAllowed);
        Ok(())
    }

    #[tokio::test]
    async fn denies_placeholder_for_secret_not_allowed_on_host() -> Result<()> {
        let placeholder = "__DSEC_33333333333333334444444444444444__";
        // Secret is allowed only on api.openai.com, but the request is sent
        // to a different host whose SNI happens to also be MITM-allowlisted.
        let mut table = secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &["api.openai.com"],
        )?;
        table.sni_match_set = DomainSet::from_patterns(&[
            "api.openai.com".to_string(),
            "api.anthropic.com".to_string(),
        ])?;
        let input = format!(
            "GET / HTTP/1.1\r\nHost: api.anthropic.com\r\nAuthorization: Bearer {placeholder}\r\n\r\n"
        );

        let error = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.anthropic.com",
            },
        )
        .await
        .expect_err("placeholder used outside its allowlist should be denied");
        assert_deny_reason(error, DenyReason::PlaceholderOnNonAllowed);
        Ok(())
    }

    #[tokio::test]
    async fn denies_placeholder_on_url_line_in_tls_mode() -> Result<()> {
        let placeholder = "__DSEC_55555555555555556666666666666666__";
        let table = secret_table_with_secret("X", placeholder, "sk-real", &["api.openai.com"])?;
        let input = format!("GET /v1/{placeholder}/items HTTP/1.1\r\nHost: api.openai.com\r\n\r\n");

        let error = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("placeholder in URL line should be denied on TLS");
        assert_deny_reason(error, DenyReason::UrlLinePlaceholder);
        Ok(())
    }

    #[tokio::test]
    async fn denies_placeholder_shaped_http_method_in_tls_mode() -> Result<()> {
        let placeholder = "__DSEC_55555555555555556666666666666666__";
        let table = secret_table_with_secret("X", placeholder, "sk-real", &["api.openai.com"])?;
        let input = format!("{placeholder} /items HTTP/1.1\r\nHost: api.openai.com\r\n\r\n");

        let error = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("placeholder-shaped method should be denied on TLS");
        assert_deny_reason(error, DenyReason::UrlLinePlaceholder);
        Ok(())
    }

    #[tokio::test]
    async fn validates_absolute_uri_before_rewriting_headers() -> Result<()> {
        let table = empty_table()?;
        let input = b"GET https://evil.example/ HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: Bearer __DSEC_99999999999999999999999999999999__\r\n\r\n";

        let error = rewrite_once(
            input,
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await
        .expect_err("absolute URI mismatch should be denied before header rewrite");
        assert_deny_reason(error, DenyReason::AbsoluteUriAuthorityMismatch);
        Ok(())
    }

    #[tokio::test]
    async fn denies_placeholder_on_plain_http_in_header_value() -> Result<()> {
        let placeholder = "__DSEC_77777777777777778888888888888888__";
        let table = secret_table_with_secret("X", placeholder, "sk-real", &["example.com"])?;
        let input = format!(
            "GET / HTTP/1.1\r\nHost: example.com\r\nAuthorization: Bearer {placeholder}\r\n\r\n"
        );

        let error = rewrite_once(
            input.as_bytes(),
            &table,
            HttpRewriteMode::PlainHttp {
                domain: "example.com",
            },
        )
        .await
        .expect_err("plain HTTP must never substitute placeholders");
        assert_deny_reason(error, DenyReason::Port80Placeholder);
        Ok(())
    }

    #[tokio::test]
    async fn does_not_panic_on_non_ascii_authorization_header() -> Result<()> {
        // Regression: `Authorization: ééééé` used to panic the rewriter task
        // because the Basic-prefix detector called `split_at("basic".len())`
        // on a string whose first 5 bytes are inside a multi-byte char.
        let table = empty_table()?;
        let output = rewrite_once(
            "GET / HTTP/1.1\r\nHost: api.openai.com\r\nAuthorization: ééééé\r\n\r\n".as_bytes(),
            &table,
            HttpRewriteMode::Tls {
                sni: "api.openai.com",
            },
        )
        .await?;
        let text = String::from_utf8(output)?;
        assert!(text.contains("Authorization: ééééé\r\n"));
        Ok(())
    }

    #[test]
    fn parses_switching_protocols_status_line() {
        assert!(is_switching_protocols_response(
            b"HTTP/1.1 101 Switching Protocols"
        ));
        assert!(is_switching_protocols_response(b"HTTP/1.0 101"));
        assert!(!is_switching_protocols_response(b"HTTP/1.1 200 OK"));
        assert!(!is_switching_protocols_response(
            b"HTTP/1.1 1010 Bogus Status"
        ));
        assert!(!is_switching_protocols_response(b"HTTP/2 101"));
        assert!(!is_switching_protocols_response(b"garbage"));
    }

    #[tokio::test]
    async fn response_copier_signals_accepted_when_upstream_returns_101() -> Result<()> {
        let (mut upstream_write, mut upstream_read) = tokio::io::duplex(16 * 1024);
        let (mut client_write, mut client_read) = tokio::io::duplex(16 * 1024);
        let (websocket_watch_tx, websocket_watch_rx) = mpsc::channel(1);

        let copier_task = tokio::spawn(async move {
            copy_responses_with_websocket_watch(
                &mut upstream_read,
                &mut client_write,
                websocket_watch_rx,
            )
            .await
        });

        let (accepted_tx, accepted_rx) = oneshot::channel();
        websocket_watch_tx
            .send(WebSocketUpgradeWatch { accepted_tx })
            .await
            .expect("watch channel should accept");

        upstream_write
            .write_all(
                b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\nframe-payload",
            )
            .await?;

        let accepted = accepted_rx.await.expect("accepted_tx should fire");
        assert!(accepted, "101 reply should be reported as accepted");

        drop(upstream_write);
        let mut received = Vec::new();
        client_read.read_to_end(&mut received).await?;
        let text = String::from_utf8(received)?;
        assert!(text.starts_with("HTTP/1.1 101 Switching Protocols\r\n"));
        assert!(text.ends_with("frame-payload"));

        copier_task.await??;
        Ok(())
    }

    #[tokio::test]
    async fn response_copier_signals_rejected_when_upstream_returns_non_101() -> Result<()> {
        let (mut upstream_write, mut upstream_read) = tokio::io::duplex(16 * 1024);
        let (mut client_write, mut client_read) = tokio::io::duplex(16 * 1024);
        let (websocket_watch_tx, websocket_watch_rx) = mpsc::channel(1);

        let copier_task = tokio::spawn(async move {
            copy_responses_with_websocket_watch(
                &mut upstream_read,
                &mut client_write,
                websocket_watch_rx,
            )
            .await
        });

        let (accepted_tx, accepted_rx) = oneshot::channel();
        websocket_watch_tx
            .send(WebSocketUpgradeWatch { accepted_tx })
            .await
            .expect("watch channel should accept");

        upstream_write
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
            .await?;

        let accepted = accepted_rx.await.expect("accepted_tx should fire");
        assert!(!accepted, "200 reply should be reported as not accepted");

        drop(upstream_write);
        let mut received = Vec::new();
        client_read.read_to_end(&mut received).await?;
        let text = String::from_utf8(received)?;
        assert!(text.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(text.ends_with("\r\n\r\nok"));

        copier_task.await??;
        Ok(())
    }

    #[tokio::test]
    async fn response_copier_passes_bytes_through_when_no_watch_is_sent() -> Result<()> {
        let (mut upstream_write, mut upstream_read) = tokio::io::duplex(16 * 1024);
        let (mut client_write, mut client_read) = tokio::io::duplex(16 * 1024);
        let (_websocket_watch_tx, websocket_watch_rx) = mpsc::channel::<WebSocketUpgradeWatch>(1);

        let copier_task = tokio::spawn(async move {
            copy_responses_with_websocket_watch(
                &mut upstream_read,
                &mut client_write,
                websocket_watch_rx,
            )
            .await
        });

        upstream_write
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello")
            .await?;
        drop(upstream_write);

        let mut received = Vec::new();
        client_read.read_to_end(&mut received).await?;
        assert_eq!(
            received,
            b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello"
        );

        copier_task.await??;
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

        // Tests don't run the response copier, so spawn an auto-accept task
        // on the watch channel. This stands in for "upstream replied 101" so
        // an upgrade request gets spliced raw, and otherwise the channel is
        // never touched.
        let (websocket_watch_tx, mut websocket_watch_rx) =
            mpsc::channel::<WebSocketUpgradeWatch>(1);
        let auto_accept_task = tokio::spawn(async move {
            while let Some(watch) = websocket_watch_rx.recv().await {
                let _ = watch.accepted_tx.send(true);
            }
        });

        let rewrite_result = forward_http1_requests(
            &mut client_read,
            &mut upstream_write,
            table,
            mode,
            &websocket_watch_tx,
        )
        .await;
        drop(websocket_watch_tx);
        auto_accept_task
            .await
            .map_err(|error| HttpRewriteError::io(anyhow!(error)))?;
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

    fn assert_deny_reason(error: HttpRewriteError, expected: DenyReason) {
        match error {
            HttpRewriteError::Denied(entry) => assert_eq!(entry.reason, expected),
            HttpRewriteError::Io(error) => panic!("expected deny, got IO error: {error}"),
        }
    }
}
