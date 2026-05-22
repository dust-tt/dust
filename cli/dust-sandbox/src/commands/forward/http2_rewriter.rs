use std::future::{poll_fn, Future};
use std::pin::Pin;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use h2::server::SendResponse;
use h2::{RecvStream, SendStream};
use http::header::{CONTENT_LENGTH, HOST, TRANSFER_ENCODING};
use http::{HeaderMap, HeaderName, HeaderValue, Request, Response, StatusCode};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tracing::warn;

use crate::egress_secrets::SecretTable;

use super::deny_log::{append_deny_log, DenyReason};
use super::rewrite_policy::{
    deny_entry, process_request_policy, Authority, HeaderPart, RequestParts, RewriteMode,
};

const H2_MAX_CONCURRENT_STREAMS: u32 = 256;
const READ_CHUNK_BYTES: usize = 8 * 1024;
const MAX_HEADER_BLOCK_BYTES: usize = 64 * 1024;
const MAX_HEADER_LINE_BYTES: usize = 16 * 1024;
const MAX_TRAILER_BLOCK_BYTES: usize = 64 * 1024;

pub(super) trait AsyncReadWrite: AsyncRead + AsyncWrite + Unpin + Send {}

impl<T> AsyncReadWrite for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

pub(super) type BoxedAsyncReadWrite = Box<dyn AsyncReadWrite>;
// The authority is intentionally not a parameter: every h2 stream on a session
// has already been gated by `process_request_policy` to match the session SNI,
// so opening upstream means opening the SNI's upstream. The opener captures
// the SNI itself; passing it back in would be redundant and would invite a
// future relaxation of the policy gate to silently bypass the SNI binding.
pub(super) type OpenH1Upstream = Arc<
    dyn Fn() -> Pin<Box<dyn Future<Output = Result<BoxedAsyncReadWrite>> + Send>> + Send + Sync,
>;

pub(super) async fn run_h2_to_h1_bridge<C>(
    agent_tls: C,
    sni: String,
    secret_table: Arc<SecretTable>,
    deny_log: Arc<std::path::PathBuf>,
    open_upstream: OpenH1Upstream,
) -> Result<()>
where
    C: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let mut builder = h2::server::Builder::new();
    builder
        .max_concurrent_streams(H2_MAX_CONCURRENT_STREAMS)
        // Advertise SETTINGS_ENABLE_CONNECT_PROTOCOL so RFC 8441 extended
        // CONNECT bootstraps (h2 WebSocket) reach our handler and we can emit
        // a structured `h2_websocket_unsupported` deny instead of letting the
        // h2 protocol layer silently reject them. The handler resets the
        // stream with REFUSED_STREAM after logging.
        .enable_connect_protocol();
    // We do not advertise SETTINGS_ENABLE_PUSH on the server side: per RFC 7540
    // ENABLE_PUSH is the client telling the server whether it accepts pushes,
    // and a server only pushes if it calls `push_promise`, which we do not.
    // The opposite-direction client-side setting lives on h2::client::Builder
    // and will be set in the outbound h2 origination slice.
    let mut connection = builder
        .handshake::<_, Bytes>(agent_tls)
        .await
        .context("failed to establish inbound h2 server session")?;

    while let Some(accepted) = connection.accept().await {
        let (request, respond) = accepted.context("failed to accept inbound h2 stream")?;
        let sni = sni.clone();
        let secret_table = Arc::clone(&secret_table);
        let deny_log = Arc::clone(&deny_log);
        let open_upstream = Arc::clone(&open_upstream);
        tokio::spawn(async move {
            if let Err(error) =
                handle_h2_stream(request, respond, sni, secret_table, deny_log, open_upstream).await
            {
                warn!(error = %error, "h2 stream bridge failed");
            }
        });
    }

    Ok(())
}

async fn handle_h2_stream(
    request: Request<RecvStream>,
    mut respond: SendResponse<Bytes>,
    sni: String,
    secret_table: Arc<SecretTable>,
    deny_log: Arc<std::path::PathBuf>,
    open_upstream: OpenH1Upstream,
) -> Result<()> {
    let (parts, body) = request.into_parts();
    let method = parts.method.to_string();
    let target = h2_request_target(&parts.uri);
    let mode = RewriteMode::Tls { sni: &sni };
    let authority = match h2_request_authority(&parts.uri, &parts.headers) {
        Ok(authority) => authority,
        Err(error) => {
            let entry = deny_entry(
                RewriteMode::Tls { sni: &sni },
                DenyReason::MalformedHeaders,
                None,
                None,
            );
            append_deny_log(&deny_log, entry)
                .await
                .context("failed to append h2 malformed-authority deny log entry")?;
            respond.send_reset(h2::Reason::PROTOCOL_ERROR);
            return Err(error);
        }
    };
    if let Err(error) = validate_h2_request_headers(&parts.headers) {
        let entry = deny_entry(mode, DenyReason::MalformedHeaders, None, Some(&authority));
        append_deny_log(&deny_log, entry)
            .await
            .context("failed to append h2 malformed-header deny log entry")?;
        respond.send_reset(h2::Reason::PROTOCOL_ERROR);
        return Err(error);
    }
    let headers = header_map_to_parts(&parts.headers);
    let policy_request = RequestParts {
        method: method.clone(),
        target: target.clone(),
        headers,
    };

    if method.eq_ignore_ascii_case("CONNECT") && is_h2_websocket_connect(&parts.extensions) {
        let entry = deny_entry(
            mode,
            DenyReason::H2WebsocketUnsupported,
            None,
            Some(&authority),
        );
        append_deny_log(&deny_log, entry)
            .await
            .context("failed to append h2 websocket deny log entry")?;
        // REFUSED_STREAM (vs INTERNAL_ERROR for policy denies below) signals
        // per RFC 7540 that the request was never processed, which is honest
        // for an unconditional protocol-level refusal.
        respond.send_reset(h2::Reason::REFUSED_STREAM);
        return Ok(());
    }

    let policy = match process_request_policy(
        &policy_request,
        Authority::Explicit { value: &authority },
        &secret_table,
        mode,
    ) {
        Ok(policy) => policy,
        Err(entry) => {
            append_deny_log(&deny_log, entry)
                .await
                .context("failed to append h2 deny log entry")?;
            respond.send_reset(h2::Reason::INTERNAL_ERROR);
            return Ok(());
        }
    };

    let mut upstream = match open_upstream().await {
        Ok(upstream) => upstream,
        Err(error) => {
            respond.send_reset(h2::Reason::INTERNAL_ERROR);
            return Err(error)
                .with_context(|| format!("failed to open h1 upstream for {authority}"));
        }
    };
    if let Err(error) = write_h1_request(
        &mut upstream,
        &method,
        &target,
        &authority,
        &policy.headers,
        body,
    )
    .await
    {
        respond.send_reset(h2::Reason::INTERNAL_ERROR);
        return Err(error);
    }
    if let Err(error) = forward_h1_response_to_h2(&mut upstream, &mut respond, &method).await {
        respond.send_reset(h2::Reason::INTERNAL_ERROR);
        return Err(error);
    }
    let _ = upstream.shutdown().await;

    Ok(())
}

fn h2_request_target(uri: &http::Uri) -> String {
    uri.path_and_query()
        .map(|value| value.as_str().to_string())
        .unwrap_or_else(|| "/".to_string())
}

fn h2_request_authority(uri: &http::Uri, headers: &HeaderMap) -> Result<String> {
    if let Some(authority) = uri.authority() {
        return Ok(authority.as_str().to_string());
    }

    let Some(host) = headers.get(HOST) else {
        return Err(anyhow!("h2 request missing :authority"));
    };
    let host = host
        .to_str()
        .context("h2 host header is not visible ASCII")?;
    Ok(host.to_string())
}

fn validate_h2_request_headers(headers: &HeaderMap) -> Result<()> {
    let mut content_length_count = 0;
    for value in headers.get_all(CONTENT_LENGTH).iter() {
        content_length_count += 1;
        if content_length_count > 1 {
            return Err(anyhow!("duplicate content-length in h2 request"));
        }
        let value = value
            .to_str()
            .context("content-length request header is not visible ASCII")?;
        value
            .trim()
            .parse::<u64>()
            .context("invalid content-length request header")?;
    }

    Ok(())
}

fn header_map_to_parts(headers: &HeaderMap) -> Vec<HeaderPart> {
    headers
        .iter()
        .map(|(name, value)| HeaderPart {
            name: name.as_str().to_string(),
            value: value.as_bytes().to_vec(),
        })
        .collect()
}

fn is_h2_websocket_connect(extensions: &http::Extensions) -> bool {
    // RFC 8441 extended CONNECT: the `:protocol` pseudo-header is carried by
    // the h2 crate as `h2::ext::Protocol` in the request extensions, NOT as a
    // header. Looking it up in the header map (as an earlier version did)
    // would always miss real h2 WebSocket bootstraps.
    extensions
        .get::<h2::ext::Protocol>()
        .map(|protocol| protocol.as_str().eq_ignore_ascii_case("websocket"))
        .unwrap_or(false)
}

async fn write_h1_request<W>(
    upstream: &mut W,
    method: &str,
    target: &str,
    authority: &str,
    headers: &[HeaderPart],
    mut body: RecvStream,
) -> Result<()>
where
    W: AsyncWrite + Unpin,
{
    let has_content_length = headers
        .iter()
        .any(|header| header.name.eq_ignore_ascii_case(CONTENT_LENGTH.as_str()));
    let use_chunked = !has_content_length && !body.is_end_stream();
    let mut header_bytes = Vec::new();
    header_bytes.extend_from_slice(format!("{method} {target} HTTP/1.1\r\n").as_bytes());
    header_bytes.extend_from_slice(format!("Host: {authority}\r\n").as_bytes());
    header_bytes.extend_from_slice(b"Connection: close\r\n");
    if use_chunked {
        header_bytes.extend_from_slice(b"Transfer-Encoding: chunked\r\n");
    }

    for header in headers {
        if should_strip_h1_bridge_header(&header.name) {
            continue;
        }
        header_bytes.extend_from_slice(header.name.as_bytes());
        header_bytes.extend_from_slice(b": ");
        header_bytes.extend_from_slice(&header.value);
        header_bytes.extend_from_slice(b"\r\n");
    }
    header_bytes.extend_from_slice(b"\r\n");
    upstream
        .write_all(&header_bytes)
        .await
        .context("failed to write h1 request headers")?;

    while let Some(chunk) = body.data().await {
        let chunk = chunk.context("failed to read h2 request body chunk")?;
        if use_chunked {
            upstream
                .write_all(format!("{:x}\r\n", chunk.len()).as_bytes())
                .await
                .context("failed to write h1 request chunk header")?;
            upstream
                .write_all(&chunk)
                .await
                .context("failed to write h1 request chunk body")?;
            upstream
                .write_all(b"\r\n")
                .await
                .context("failed to write h1 request chunk terminator")?;
        } else {
            upstream
                .write_all(&chunk)
                .await
                .context("failed to write h1 request body chunk")?;
        }
        body.flow_control()
            .release_capacity(chunk.len())
            .context("failed to release h2 request flow-control capacity")?;
    }

    if let Some(trailers) = body
        .trailers()
        .await
        .context("failed to read h2 trailers")?
    {
        if use_chunked {
            write_h1_trailers(upstream, trailers).await?;
        }
    } else if use_chunked {
        upstream
            .write_all(b"0\r\n\r\n")
            .await
            .context("failed to terminate h1 chunked request body")?;
    }

    upstream
        .flush()
        .await
        .context("failed to flush h1 request")?;
    Ok(())
}

async fn write_h1_trailers<W>(upstream: &mut W, trailers: HeaderMap) -> Result<()>
where
    W: AsyncWrite + Unpin,
{
    upstream
        .write_all(b"0\r\n")
        .await
        .context("failed to write final h1 request chunk")?;
    for (name, value) in trailers.iter() {
        if should_strip_h1_bridge_header(name.as_str()) {
            continue;
        }
        upstream
            .write_all(name.as_str().as_bytes())
            .await
            .context("failed to write h1 trailer name")?;
        upstream
            .write_all(b": ")
            .await
            .context("failed to write h1 trailer separator")?;
        upstream
            .write_all(value.as_bytes())
            .await
            .context("failed to write h1 trailer value")?;
        upstream
            .write_all(b"\r\n")
            .await
            .context("failed to write h1 trailer terminator")?;
    }
    upstream
        .write_all(b"\r\n")
        .await
        .context("failed to finish h1 trailers")?;
    Ok(())
}

fn should_strip_h1_bridge_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "connection"
            | "host"
            | "keep-alive"
            | "proxy-connection"
            | "te"
            | "transfer-encoding"
            | "upgrade"
    )
}

async fn forward_h1_response_to_h2<R>(
    upstream: &mut R,
    respond: &mut SendResponse<Bytes>,
    request_method: &str,
) -> Result<()>
where
    R: AsyncRead + Unpin,
{
    let mut reader = H1ResponseReader::new(upstream);
    let response_head = reader
        .read_final_response_head()
        .await
        .context("failed to read h1 response head")?;
    let no_body = response_has_no_body(request_method, response_head.status);
    let mut response = Response::builder().status(response_head.status);
    for header in &response_head.headers {
        if should_strip_h1_bridge_header(header.name.as_str()) {
            continue;
        }
        let name = HeaderName::from_bytes(header.name.as_bytes())
            .context("invalid h1 response header name")?;
        let value =
            HeaderValue::from_bytes(&header.value).context("invalid h1 response header value")?;
        response = response.header(name, value);
    }
    let response = response
        .body(())
        .context("failed to build h2 response head")?;

    if no_body || response_head.body_kind == H1BodyKind::None {
        respond
            .send_response(response, true)
            .context("failed to send h2 response head")?;
        return Ok(());
    }

    let mut send = respond
        .send_response(response, false)
        .context("failed to send h2 response head")?;
    match response_head.body_kind {
        H1BodyKind::None => {}
        H1BodyKind::ContentLength(len) => {
            reader
                .forward_content_length_body(len, &mut send)
                .await
                .context("failed to forward h1 content-length body")?;
        }
        H1BodyKind::Chunked => {
            reader
                .forward_chunked_body(&mut send)
                .await
                .context("failed to forward h1 chunked body")?;
        }
        H1BodyKind::EofDelimited => {
            reader
                .forward_eof_body(&mut send)
                .await
                .context("failed to forward h1 EOF-delimited body")?;
        }
    }

    Ok(())
}

fn response_has_no_body(request_method: &str, status: StatusCode) -> bool {
    request_method.eq_ignore_ascii_case("HEAD")
        || status.is_informational()
        || status == StatusCode::NO_CONTENT
        || status == StatusCode::NOT_MODIFIED
}

struct H1ResponseHead {
    status: StatusCode,
    headers: Vec<HeaderPart>,
    body_kind: H1BodyKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum H1BodyKind {
    None,
    ContentLength(usize),
    Chunked,
    EofDelimited,
}

struct H1ResponseReader<'a, R> {
    inner: &'a mut R,
    buffer: Vec<u8>,
}

impl<'a, R> H1ResponseReader<'a, R>
where
    R: AsyncRead + Unpin,
{
    fn new(inner: &'a mut R) -> Self {
        Self {
            inner,
            buffer: Vec::new(),
        }
    }

    async fn read_final_response_head(&mut self) -> Result<H1ResponseHead> {
        loop {
            let head = self.read_response_head().await?;
            if !head.status.is_informational() {
                return Ok(head);
            }
        }
    }

    async fn read_response_head(&mut self) -> Result<H1ResponseHead> {
        let header_len = self.read_header_block().await?;
        let mut headers = [httparse::EMPTY_HEADER; 256];
        let mut response = httparse::Response::new(&mut headers);
        let status = response
            .parse(&self.buffer[..header_len])
            .context("failed to parse h1 response head")?;
        if !status.is_complete() {
            return Err(anyhow!("incomplete h1 response head"));
        }
        let code = response
            .code
            .ok_or_else(|| anyhow!("h1 response missing status code"))?;
        let status = StatusCode::from_u16(code).context("invalid h1 response status")?;
        let headers = response
            .headers
            .iter()
            .map(|header| HeaderPart {
                name: header.name.to_string(),
                value: header.value.to_vec(),
            })
            .collect::<Vec<_>>();
        let body_kind = response_body_kind(&headers)?;
        self.buffer.drain(..header_len);
        Ok(H1ResponseHead {
            status,
            headers,
            body_kind,
        })
    }

    async fn read_header_block(&mut self) -> Result<usize> {
        loop {
            if let Some(header_end) = find_subslice(&self.buffer, b"\r\n\r\n") {
                let header_len = header_end + 4;
                if header_len > MAX_HEADER_BLOCK_BYTES {
                    return Err(anyhow!("h1 response header block exceeded limit"));
                }
                return Ok(header_len);
            }
            if self.buffer.len() >= MAX_HEADER_BLOCK_BYTES {
                return Err(anyhow!("h1 response header block exceeded limit"));
            }
            let mut chunk = [0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .context("failed to read h1 response")?;
            if bytes_read == 0 {
                return Err(anyhow!("upstream closed before h1 response head"));
            }
            self.buffer.extend_from_slice(&chunk[..bytes_read]);
        }
    }

    async fn read_line(&mut self) -> Result<Vec<u8>> {
        loop {
            if let Some(line_end) = find_subslice(&self.buffer, b"\r\n") {
                let line_len = line_end + 2;
                if line_len > MAX_HEADER_LINE_BYTES {
                    return Err(anyhow!("h1 line exceeded limit"));
                }
                let line = self.buffer[..line_len].to_vec();
                self.buffer.drain(..line_len);
                return Ok(line);
            }
            if self.buffer.len() > MAX_HEADER_LINE_BYTES {
                return Err(anyhow!("h1 line exceeded limit"));
            }
            let mut chunk = [0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .context("failed to read h1 line")?;
            if bytes_read == 0 {
                return Err(anyhow!("upstream closed before line terminator"));
            }
            self.buffer.extend_from_slice(&chunk[..bytes_read]);
        }
    }

    async fn read_exact_bytes(&mut self, len: usize) -> Result<Bytes> {
        while self.buffer.len() < len {
            let mut chunk = [0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .context("failed to read h1 body")?;
            if bytes_read == 0 {
                return Err(anyhow!("upstream closed mid-body"));
            }
            self.buffer.extend_from_slice(&chunk[..bytes_read]);
        }
        let bytes = Bytes::copy_from_slice(&self.buffer[..len]);
        self.buffer.drain(..len);
        Ok(bytes)
    }

    async fn forward_content_length_body(
        &mut self,
        len: usize,
        send: &mut SendStream<Bytes>,
    ) -> Result<()> {
        let mut remaining = len;
        if remaining == 0 {
            send_data(send, Bytes::new(), true).await?;
            return Ok(());
        }

        while remaining > 0 {
            let chunk_len = remaining.min(READ_CHUNK_BYTES);
            let chunk = self.read_exact_bytes(chunk_len).await?;
            remaining -= chunk.len();
            send_data(send, chunk, remaining == 0).await?;
        }
        Ok(())
    }

    async fn forward_chunked_body(&mut self, send: &mut SendStream<Bytes>) -> Result<()> {
        loop {
            let line = self.read_line().await?;
            let chunk_size = parse_chunk_size(&line)?;
            if chunk_size == 0 {
                let trailers = self.read_trailers().await?;
                if trailers.is_empty() {
                    send_data(send, Bytes::new(), true).await?;
                } else {
                    send.send_trailers(trailers)
                        .context("failed to send h2 response trailers")?;
                }
                return Ok(());
            }
            let chunk = self.read_exact_bytes(chunk_size).await?;
            let crlf = self.read_exact_bytes(2).await?;
            if crlf.as_ref() != b"\r\n" {
                return Err(anyhow!("h1 chunk missing CRLF"));
            }
            send_data(send, chunk, false).await?;
        }
    }

    async fn read_trailers(&mut self) -> Result<HeaderMap> {
        let mut trailer_bytes = Vec::new();
        loop {
            let line = self.read_line().await?;
            trailer_bytes.extend_from_slice(&line);
            if trailer_bytes.len() > MAX_TRAILER_BLOCK_BYTES {
                return Err(anyhow!("h1 trailer block exceeded limit"));
            }
            if line == b"\r\n" {
                break;
            }
        }

        let mut map = HeaderMap::new();
        if trailer_bytes == b"\r\n" {
            return Ok(map);
        }
        let mut headers = [httparse::EMPTY_HEADER; 64];
        let mut request = httparse::Request::new(&mut headers);
        let mut synthetic = b"GET / HTTP/1.1\r\n".to_vec();
        synthetic.extend_from_slice(&trailer_bytes);
        request
            .parse(&synthetic)
            .context("failed to parse h1 trailers")?;
        for header in request.headers.iter() {
            if should_strip_h1_bridge_header(header.name) {
                continue;
            }
            let name = HeaderName::from_bytes(header.name.as_bytes())
                .context("invalid h1 trailer name")?;
            let value =
                HeaderValue::from_bytes(header.value).context("invalid h1 trailer value")?;
            map.append(name, value);
        }
        Ok(map)
    }

    async fn forward_eof_body(&mut self, send: &mut SendStream<Bytes>) -> Result<()> {
        if !self.buffer.is_empty() {
            let bytes = Bytes::copy_from_slice(&self.buffer);
            self.buffer.clear();
            send_data(send, bytes, false).await?;
        }

        loop {
            let mut chunk = vec![0_u8; READ_CHUNK_BYTES];
            let bytes_read = self
                .inner
                .read(&mut chunk)
                .await
                .context("failed to read EOF-delimited h1 body")?;
            if bytes_read == 0 {
                send_data(send, Bytes::new(), true).await?;
                return Ok(());
            }
            chunk.truncate(bytes_read);
            send_data(send, Bytes::from(chunk), false).await?;
        }
    }
}

fn response_body_kind(headers: &[HeaderPart]) -> Result<H1BodyKind> {
    let mut content_length = None;
    let mut seen_content_length = false;
    let mut seen_transfer_encoding = false;
    let mut has_chunked_transfer_encoding = false;

    for header in headers {
        if header.name.eq_ignore_ascii_case(CONTENT_LENGTH.as_str()) {
            if seen_content_length {
                return Err(anyhow!("duplicate content-length in h1 response"));
            }
            seen_content_length = true;
            let value = std::str::from_utf8(&header.value)
                .context("content-length response header is not utf8")?;
            content_length = Some(
                value
                    .trim()
                    .parse::<usize>()
                    .context("invalid content-length response header")?,
            );
        } else if header.name.eq_ignore_ascii_case(TRANSFER_ENCODING.as_str()) {
            if seen_transfer_encoding {
                return Err(anyhow!("multiple h1 response transfer-encoding headers"));
            }
            seen_transfer_encoding = true;
            let value = std::str::from_utf8(&header.value)
                .context("transfer-encoding response header is not utf8")?;
            let mut tokens = value
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty());
            match (tokens.next(), tokens.next()) {
                (Some(token), None) if token.eq_ignore_ascii_case("chunked") => {
                    has_chunked_transfer_encoding = true;
                }
                _ => return Err(anyhow!("unsupported h1 response transfer-encoding")),
            }
        }
    }

    if has_chunked_transfer_encoding {
        return Ok(H1BodyKind::Chunked);
    }

    Ok(content_length.map_or(H1BodyKind::EofDelimited, H1BodyKind::ContentLength))
}

fn parse_chunk_size(line: &[u8]) -> Result<usize> {
    let text = std::str::from_utf8(line).context("chunk size line is not utf8")?;
    let line = text
        .strip_suffix("\r\n")
        .ok_or_else(|| anyhow!("chunk size line missing CRLF"))?;
    let size = line.split_once(';').map_or(line, |(size, _)| size).trim();
    usize::from_str_radix(size, 16).context("invalid chunk size")
}

async fn send_data(send: &mut SendStream<Bytes>, data: Bytes, end_stream: bool) -> Result<()> {
    if data.is_empty() {
        send.send_data(data, end_stream)
            .context("failed to send h2 data")?;
        return Ok(());
    }

    let mut offset = 0;
    while offset < data.len() {
        while send.capacity() == 0 {
            let remaining = data.len() - offset;
            send.reserve_capacity(remaining.min(READ_CHUNK_BYTES));
            let capacity = poll_fn(|cx| send.poll_capacity(cx))
                .await
                .ok_or_else(|| anyhow!("h2 send stream closed while waiting for capacity"))?
                .context("h2 send capacity failed")?;
            if capacity == 0 {
                continue;
            }
        }

        let chunk_len = send.capacity().min(data.len() - offset);
        let chunk = data.slice(offset..offset + chunk_len);
        offset += chunk_len;
        send.send_data(chunk, end_stream && offset == data.len())
            .context("failed to send h2 data")?;
    }

    Ok(())
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::path::PathBuf;

    use anyhow::{ensure, Result};
    use base64::{engine::general_purpose, Engine as _};
    use tokio::sync::mpsc;

    use crate::egress_secrets::{DomainSet, Secret};

    use super::*;

    #[test]
    fn rejects_duplicate_h2_content_length_request_headers() {
        let mut headers = HeaderMap::new();
        headers.append(CONTENT_LENGTH, HeaderValue::from_static("5"));
        headers.append(CONTENT_LENGTH, HeaderValue::from_static("5"));

        let error = validate_h2_request_headers(&headers)
            .expect_err("duplicate h2 content-length should be rejected");
        assert!(error.to_string().contains("duplicate content-length"));
    }

    #[test]
    fn rejects_invalid_h2_content_length_request_header() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("5, 5"));

        let error = validate_h2_request_headers(&headers)
            .expect_err("invalid h2 content-length should be rejected");
        assert!(error.to_string().contains("invalid content-length"));
    }

    #[test]
    fn rejects_non_plain_chunked_h1_response_transfer_encoding() {
        let headers = vec![HeaderPart {
            name: "transfer-encoding".to_string(),
            value: b"gzip, chunked".to_vec(),
        }];

        let error = response_body_kind(&headers)
            .expect_err("non-plain chunked transfer-encoding should be rejected");
        assert!(error
            .to_string()
            .contains("unsupported h1 response transfer-encoding"));
    }

    #[tokio::test]
    async fn h2_bridge_substitutes_header_and_maps_h1_response() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_0123456789abcdef0123456789abcdef__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-deny-test.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/v1/models"))
            .header("authorization", format!("Bearer {placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("GET /v1/models HTTP/1.1\r\n"));
        assert!(request_text.contains("Host: api.openai.com\r\n"));
        assert!(request_text.contains("authorization: Bearer sk-real\r\n"));
        assert!(!request_text.contains(placeholder));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_preserves_basic_auth_round_trip() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_aabbccddeeff00112233445566778899__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 204 No Content\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-basic-deny-test.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let encoded = general_purpose::STANDARD.encode(format!("user:{placeholder}"));
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/"))
            .header("authorization", format!("Basic {encoded}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        let expected = general_purpose::STANDARD.encode("user:sk-real");
        assert!(request_text.contains(&format!("authorization: Basic {expected}\r\n")));
        assert!(!request_text.contains(placeholder));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_forwards_request_body_with_content_length() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_0123456789abcdef0123456789abcdef__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_content_length_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-body-deny-test.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/upload"))
            .header("content-length", "5")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("POST /upload HTTP/1.1\r\n"));
        assert!(request_text.contains("content-length: 5\r\n"));
        assert!(request_text.ends_with("\r\n\r\nhello"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_maps_chunked_response_and_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_0123456789abcdef0123456789abcdef__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n0\r\nx-done: yes\r\n\r\n",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-chunked-deny-test.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            deny_log,
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/stream"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().get(TRANSFER_ENCODING).is_none());
        let mut body = response.into_body();
        let mut output = Vec::new();
        while let Some(chunk) = body.data().await {
            let chunk = chunk?;
            output.extend_from_slice(&chunk);
            body.flow_control().release_capacity(chunk.len())?;
        }
        assert_eq!(output, b"ok");
        let trailers = body
            .trailers()
            .await?
            .ok_or_else(|| anyhow!("missing h2 trailers"))?;
        assert_eq!(
            trailers.get("x-done"),
            Some(&HeaderValue::from_static("yes"))
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_resets_denied_stream_without_closing_sibling() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_33333333333333334444444444444444__";
        let secret_table = Arc::new(secret_table_with_secret(
            "ANTHROPIC_API_KEY",
            placeholder,
            "sk-real",
            &["api.anthropic.com"],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);

        let denied = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/denied"))
            .header("authorization", format!("Bearer {placeholder}"))
            .body(())?;
        let (denied_response, _stream) = send_request.send_request(denied, true)?;
        assert!(denied_response.await.is_err());

        let allowed = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/allowed"))
            .body(())?;
        let (allowed_response, _stream) = send_request.send_request(allowed, true)?;
        let allowed_response = allowed_response.await?;
        assert_eq!(allowed_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(allowed_response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("allowed sibling did not reach upstream"))?;
        assert!(request_text.contains("GET /allowed HTTP/1.1\r\n"));
        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(deny_log_text.contains("\"reason\":\"placeholder_on_non_allowed\""));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_websocket_connect_via_extended_protocol() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_55555555555555556666666666666666__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 200 OK\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let mut request = Request::builder()
            .method("CONNECT")
            .uri(format!("https://{sni}/"))
            .body(())?;
        request
            .extensions_mut()
            .insert(h2::ext::Protocol::from("websocket"));
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(response.await.is_err(), "CONNECT websocket should be reset");

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"h2_websocket_unsupported\""),
            "deny log should record h2_websocket_unsupported, got: {deny_log_text}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_authority_sni_mismatch() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_77777777777777778888888888888888__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 200 OK\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri("https://api.anthropic.com/v1/messages")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            ":authority/SNI mismatch should reset"
        );

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"host_sni_mismatch\""),
            "deny log should record host_sni_mismatch, got: {deny_log_text}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_placeholder_in_path() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_99999999999999990000000000000000__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 200 OK\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/v1/{placeholder}/list"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(response.await.is_err(), "placeholder in :path should reset");

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"url_line_placeholder\""),
            "deny log should record url_line_placeholder, got: {deny_log_text}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_advertises_max_concurrent_streams_cap() -> Result<()> {
        // We assert the cap is advertised in the server's SETTINGS frame.
        // Exhausting the budget with 257 concurrent streams would need a
        // synchronization primitive to hold all sibling streams open
        // simultaneously; the SETTINGS check covers the load-bearing fact
        // (the cap is sent), and h2 enforces the rest.
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(request_tx, b"HTTP/1.1 200 OK\r\n\r\n");

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let bridge_task = tokio::spawn(run_h2_to_h1_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            opener,
        ));

        let (send_request, connection) = h2::client::handshake(client_io).await?;
        // The server's SETTINGS frame is consumed during handshake; the client
        // exposes the negotiated value via `max_concurrent_send_streams`.
        // Driving the connection forward at least once is required for the
        // SETTINGS frame to be parsed.
        let connection_task = tokio::spawn(connection);
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(
            send_request.current_max_send_streams(),
            H2_MAX_CONCURRENT_STREAMS as usize,
            "server should advertise MAX_CONCURRENT_STREAMS={H2_MAX_CONCURRENT_STREAMS}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    fn test_h1_opener(
        request_tx: mpsc::UnboundedSender<String>,
        response: &'static [u8],
    ) -> OpenH1Upstream {
        Arc::new(move || {
            let request_tx = request_tx.clone();
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    loop {
                        let mut byte = [0_u8; 1];
                        upstream_io.read_exact(&mut byte).await?;
                        request.push(byte[0]);
                        if request.ends_with(b"\r\n\r\n") {
                            break;
                        }
                    }
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    upstream_io.write_all(response).await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn test_h1_opener_with_content_length_body(
        request_tx: mpsc::UnboundedSender<String>,
        response: &'static [u8],
    ) -> OpenH1Upstream {
        Arc::new(move || {
            let request_tx = request_tx.clone();
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    loop {
                        let mut byte = [0_u8; 1];
                        upstream_io.read_exact(&mut byte).await?;
                        request.push(byte[0]);
                        if request.ends_with(b"\r\n\r\n") {
                            break;
                        }
                    }
                    let header_text = String::from_utf8(request.clone())?;
                    let content_length = parse_test_content_length(&header_text)?;
                    let mut body = vec![0_u8; content_length];
                    upstream_io.read_exact(&mut body).await?;
                    request.extend_from_slice(&body);
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    upstream_io.write_all(response).await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn parse_test_content_length(headers: &str) -> Result<usize> {
        headers
            .lines()
            .find_map(|line| {
                line.split_once(':').and_then(|(name, value)| {
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>())
                })
            })
            .ok_or_else(|| anyhow!("missing content-length"))?
            .context("invalid content-length")
    }

    async fn read_h2_body(mut body: RecvStream) -> Result<Vec<u8>> {
        let mut output = Vec::new();
        while let Some(chunk) = body.data().await {
            let chunk = chunk?;
            output.extend_from_slice(&chunk);
            body.flow_control().release_capacity(chunk.len())?;
        }
        ensure!(body.trailers().await?.is_none(), "unexpected trailers");
        Ok(output)
    }

    fn secret_table_with_secret(
        name: &str,
        placeholder: &str,
        value: &str,
        patterns: &[&str],
    ) -> Result<SecretTable> {
        let allowed_domains = patterns
            .iter()
            .map(|pattern| (*pattern).to_string())
            .collect::<Vec<_>>();
        let domain_set = DomainSet::from_patterns(&allowed_domains)?;
        let secret = Secret {
            name: name.to_string(),
            placeholder: placeholder.to_string(),
            value: value.to_string(),
            allowed_domains: domain_set,
        };
        let mut by_placeholder = HashMap::new();
        by_placeholder.insert(placeholder.to_string(), secret);
        Ok(SecretTable {
            by_placeholder,
            sni_match_set: DomainSet::from_patterns(&allowed_domains)?,
        })
    }
}
