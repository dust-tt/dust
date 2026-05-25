use std::collections::HashSet;
use std::future::{poll_fn, Future};
use std::pin::Pin;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use h2::server::SendResponse;
use h2::{RecvStream, SendStream};
use http::header::{CONTENT_LENGTH, EXPECT, HOST, TRANSFER_ENCODING};
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
// Safety cap for one declared h1 chunk. Forwarding still streams chunks in
// READ_CHUNK_BYTES pieces so normal large responses do not need one allocation.
const MAX_H1_RESPONSE_CHUNK_BYTES: usize = 64 * 1024 * 1024;

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

#[derive(Clone, Copy)]
struct H2RequestDeny {
    reason: DenyReason,
    reset: h2::Reason,
}

impl H2RequestDeny {
    fn internal(reason: DenyReason) -> Self {
        Self {
            reason,
            reset: h2::Reason::INTERNAL_ERROR,
        }
    }

    fn refused(reason: DenyReason) -> Self {
        Self {
            reason,
            reset: h2::Reason::REFUSED_STREAM,
        }
    }
}

enum WriteH1RequestError {
    Denied(H2RequestDeny),
    Bridge(anyhow::Error),
}

type WriteH1RequestResult<T> = std::result::Result<T, WriteH1RequestError>;

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
        // Keep inbound h2 request headers under the same bound as the h1
        // rewriter before HPACK decoding can buffer a much larger block.
        .max_header_list_size(MAX_HEADER_BLOCK_BYTES as u32);
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

    if has_expect_100_continue(&policy.headers) {
        let entry = deny_entry(
            mode,
            DenyReason::ExpectContinueUnsupported,
            None,
            Some(&authority),
        );
        append_deny_log(&deny_log, entry)
            .await
            .context("failed to append h2 expect-continue deny log entry")?;
        send_expectation_failed(&mut respond).context("failed to send h2 417 response")?;
        discard_h2_request_body(body);
        return Ok(());
    }

    let (header_bytes, use_chunked) = match build_h1_request_head(
        &method,
        &target,
        &authority,
        &policy.headers,
        body.is_end_stream(),
    ) {
        Ok(result) => result,
        Err(deny) => {
            let entry = deny_entry(mode, deny.reason, None, Some(&authority));
            append_deny_log(&deny_log, entry)
                .await
                .context("failed to append h2 request-header deny log entry")?;
            respond.send_reset(deny.reset);
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
    match write_h1_request(&mut upstream, header_bytes, use_chunked, body).await {
        Ok(()) => {}
        Err(WriteH1RequestError::Denied(deny)) => {
            let entry = deny_entry(mode, deny.reason, None, Some(&authority));
            append_deny_log(&deny_log, entry)
                .await
                .context("failed to append h2 request-body deny log entry")?;
            respond.send_reset(deny.reset);
            let _ = upstream.shutdown().await;
            return Ok(());
        }
        Err(WriteH1RequestError::Bridge(error)) => {
            respond.send_reset(h2::Reason::INTERNAL_ERROR);
            let _ = upstream.shutdown().await;
            return Err(error);
        }
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

fn has_expect_100_continue(headers: &[HeaderPart]) -> bool {
    headers.iter().any(|header| {
        header.name.eq_ignore_ascii_case(EXPECT.as_str())
            && std::str::from_utf8(&header.value)
                .map(|value| value.trim().eq_ignore_ascii_case("100-continue"))
                .unwrap_or(false)
    })
}

fn send_expectation_failed(respond: &mut SendResponse<Bytes>) -> Result<()> {
    // TODO: Replace this synthetic response with concurrent request upload and
    // upstream response forwarding in https://github.com/dust-tt/dust/issues/26109.
    let response = Response::builder()
        .status(StatusCode::EXPECTATION_FAILED)
        .body(())
        .context("failed to build h2 417 response")?;
    respond
        .send_response(response, true)
        .context("failed to send h2 417 response")?;
    Ok(())
}

fn discard_h2_request_body(mut body: RecvStream) {
    tokio::spawn(async move {
        while let Some(chunk) = body.data().await {
            let Ok(chunk) = chunk else {
                return;
            };
            let _ = body.flow_control().release_capacity(chunk.len());
        }
        let _ = body.trailers().await;
    });
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

fn build_h1_request_head(
    method: &str,
    target: &str,
    authority: &str,
    headers: &[HeaderPart],
    body_is_end_stream: bool,
) -> std::result::Result<(Vec<u8>, bool), H2RequestDeny> {
    let has_content_length = headers
        .iter()
        .any(|header| header.name.eq_ignore_ascii_case(CONTENT_LENGTH.as_str()));
    let use_chunked = !has_content_length && !body_is_end_stream;
    let mut header_bytes = Vec::new();
    append_h1_head_bytes(
        &mut header_bytes,
        format!("{method} {target} HTTP/1.1\r\n").as_bytes(),
    )?;
    append_h1_header_line(&mut header_bytes, b"Host", authority.as_bytes())?;
    append_h1_header_line(&mut header_bytes, b"Connection", b"close")?;
    if use_chunked {
        append_h1_header_line(&mut header_bytes, b"Transfer-Encoding", b"chunked")?;
    }

    for header in headers {
        if should_strip_h1_bridge_header(&header.name) {
            continue;
        }
        append_h1_header_line(&mut header_bytes, header.name.as_bytes(), &header.value)?;
    }
    append_h1_head_bytes(&mut header_bytes, b"\r\n")?;

    Ok((header_bytes, use_chunked))
}

fn append_h1_head_bytes(
    header_bytes: &mut Vec<u8>,
    bytes: &[u8],
) -> std::result::Result<(), H2RequestDeny> {
    if header_bytes.len() + bytes.len() > MAX_HEADER_BLOCK_BYTES {
        return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
    }
    header_bytes.extend_from_slice(bytes);
    Ok(())
}

fn append_h1_header_line(
    header_bytes: &mut Vec<u8>,
    name: &[u8],
    value: &[u8],
) -> std::result::Result<(), H2RequestDeny> {
    let line_len = name.len() + b": ".len() + value.len() + b"\r\n".len();
    if line_len > MAX_HEADER_LINE_BYTES {
        return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
    }
    if header_bytes.len() + line_len > MAX_HEADER_BLOCK_BYTES {
        return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
    }
    header_bytes.extend_from_slice(name);
    header_bytes.extend_from_slice(b": ");
    header_bytes.extend_from_slice(value);
    header_bytes.extend_from_slice(b"\r\n");
    Ok(())
}

async fn write_h1_request<W>(
    upstream: &mut W,
    header_bytes: Vec<u8>,
    use_chunked: bool,
    mut body: RecvStream,
) -> WriteH1RequestResult<()>
where
    W: AsyncWrite + Unpin,
{
    upstream
        .write_all(&header_bytes)
        .await
        .context("failed to write h1 request headers")
        .map_err(WriteH1RequestError::Bridge)?;

    while let Some(chunk) = body.data().await {
        let chunk = chunk
            .context("failed to read h2 request body chunk")
            .map_err(WriteH1RequestError::Bridge)?;
        body.flow_control()
            .release_capacity(chunk.len())
            .context("failed to release h2 request flow-control capacity")
            .map_err(WriteH1RequestError::Bridge)?;
        if chunk.is_empty() {
            continue;
        }
        if use_chunked {
            upstream
                .write_all(format!("{:x}\r\n", chunk.len()).as_bytes())
                .await
                .context("failed to write h1 request chunk header")
                .map_err(WriteH1RequestError::Bridge)?;
            upstream
                .write_all(&chunk)
                .await
                .context("failed to write h1 request chunk body")
                .map_err(WriteH1RequestError::Bridge)?;
            upstream
                .write_all(b"\r\n")
                .await
                .context("failed to write h1 request chunk terminator")
                .map_err(WriteH1RequestError::Bridge)?;
        } else {
            upstream
                .write_all(&chunk)
                .await
                .context("failed to write h1 request body chunk")
                .map_err(WriteH1RequestError::Bridge)?;
        }
    }

    if let Some(trailers) = body
        .trailers()
        .await
        .context("failed to read h2 trailers")
        .map_err(WriteH1RequestError::Bridge)?
    {
        if !trailers.is_empty() {
            return Err(WriteH1RequestError::Denied(H2RequestDeny::refused(
                DenyReason::RequestTrailersUnsupported,
            )));
        }
        if use_chunked {
            upstream
                .write_all(b"0\r\n\r\n")
                .await
                .context("failed to terminate h1 chunked request body")
                .map_err(WriteH1RequestError::Bridge)?;
        }
    } else if use_chunked {
        upstream
            .write_all(b"0\r\n\r\n")
            .await
            .context("failed to terminate h1 chunked request body")
            .map_err(WriteH1RequestError::Bridge)?;
    }

    upstream
        .flush()
        .await
        .context("failed to flush h1 request")
        .map_err(WriteH1RequestError::Bridge)?;
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

fn connection_nominated_headers(headers: &[HeaderPart]) -> Result<HashSet<String>> {
    let mut nominated = HashSet::new();
    for header in headers {
        if !header.name.eq_ignore_ascii_case("connection") {
            continue;
        }
        let value =
            std::str::from_utf8(&header.value).context("connection response header is not utf8")?;
        for token in value.split(',') {
            let token = token.trim();
            if !token.is_empty() {
                nominated.insert(token.to_ascii_lowercase());
            }
        }
    }
    Ok(nominated)
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
    let nominated_hop_headers = connection_nominated_headers(&response_head.headers)?;
    for header in &response_head.headers {
        if should_strip_h1_bridge_header(header.name.as_str()) {
            continue;
        }
        if nominated_hop_headers.contains(&header.name.to_ascii_lowercase()) {
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
            if chunk_size > MAX_H1_RESPONSE_CHUNK_BYTES {
                return Err(anyhow!(
                    "h1 response chunk exceeded {} byte limit",
                    MAX_H1_RESPONSE_CHUNK_BYTES
                ));
            }
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
            let mut remaining = chunk_size;
            while remaining > 0 {
                let slice_len = remaining.min(READ_CHUNK_BYTES);
                let chunk = self.read_exact_bytes(slice_len).await?;
                remaining -= chunk.len();
                send_data(send, chunk, false).await?;
            }
            let crlf = self.read_exact_bytes(2).await?;
            if crlf.as_ref() != b"\r\n" {
                return Err(anyhow!("h1 chunk missing CRLF"));
            }
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
        if seen_content_length {
            return Err(anyhow!(
                "ambiguous h1 response framing: transfer-encoding and content-length"
            ));
        }
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
    use std::sync::atomic::{AtomicUsize, Ordering};

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

    #[test]
    fn rejects_ambiguous_chunked_and_content_length_h1_response() {
        let headers = vec![
            HeaderPart {
                name: "transfer-encoding".to_string(),
                value: b"chunked".to_vec(),
            },
            HeaderPart {
                name: "content-length".to_string(),
                value: b"999".to_vec(),
            },
        ];

        let error = response_body_kind(&headers)
            .expect_err("TE plus content-length response should be rejected");
        assert!(error.to_string().contains("ambiguous h1 response framing"));
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
    async fn h2_bridge_ignores_empty_data_frames_inside_chunked_request() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_21212121212121214343434343434343__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-empty-data-deny-test.log"));
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
            .uri(format!("https://{sni}/chunked"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"he"), false)?;
        stream.send_data(Bytes::new(), false)?;
        stream.send_data(Bytes::from_static(b"llo"), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(request_text.ends_with("\r\n\r\n2\r\nhe\r\n3\r\nllo\r\n0\r\n\r\n"));
        assert!(!request_text.contains("0\r\n\r\n3\r\nllo"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_writes_single_terminator_for_empty_chunked_request_body() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_23232323232323234545454545454545__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-empty-only-deny-test.log"));
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
            .uri(format!("https://{sni}/empty"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::new(), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(request_text.ends_with("\r\n\r\n0\r\n\r\n"));
        assert_eq!(request_text.matches("0\r\n\r\n").count(), 1);

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
        assert!(response.headers().get(CONTENT_LENGTH).is_none());
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
    async fn h2_bridge_streams_large_h1_chunk_before_full_chunk_arrives() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_24242424242424244646464646464646__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let (first_write_tx, mut first_write_rx) = mpsc::unbounded_channel();
        let continue_response = Arc::new(tokio::sync::Notify::new());
        let first_part = vec![b'a'; READ_CHUNK_BYTES];
        let second_part = vec![b'b'; 1024];
        let total_len = first_part.len() + second_part.len();
        let opener = test_h1_opener_with_split_chunked_response(
            request_tx,
            first_write_tx,
            Arc::clone(&continue_response),
            first_part,
            second_part,
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-large-chunk-deny-test.log"));
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
            .uri(format!("https://{sni}/stream-large"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        first_write_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not write first chunk part"))?;
        let mut body = response.into_body();
        let first_chunk = tokio::time::timeout(std::time::Duration::from_secs(1), body.data())
            .await
            .context("bridge did not emit partial chunk before the full h1 chunk arrived")?
            .ok_or_else(|| anyhow!("h2 body ended before first chunk"))??;
        assert_eq!(first_chunk.len(), READ_CHUNK_BYTES);
        body.flow_control().release_capacity(first_chunk.len())?;

        continue_response.notify_waiters();
        let mut received = first_chunk.len();
        while let Some(chunk) = body.data().await {
            let chunk = chunk?;
            received += chunk.len();
            body.flow_control().release_capacity(chunk.len())?;
        }
        ensure!(body.trailers().await?.is_none(), "unexpected trailers");
        assert_eq!(received, total_len);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_resets_chunked_response_over_single_chunk_cap() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_25252525252525254747474747474747__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let response = format!(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n",
            MAX_H1_RESPONSE_CHUNK_BYTES + 1
        );
        let opener = test_h1_opener(request_tx, response.as_bytes());

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-chunk-cap-deny-test.log"));
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
            .uri(format!("https://{sni}/too-large"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        match response.await {
            Ok(response) => {
                assert_eq!(response.status(), StatusCode::OK);
                let body_result = read_h2_body(response.into_body()).await;
                assert!(
                    body_result.is_err(),
                    "oversized h1 chunk should reset the response body"
                );
            }
            Err(_error) => {}
        }

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_resets_ambiguous_chunked_content_length_response() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_10101010101010102020202020202020__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 5\r\n\r\n2\r\nok\r\n0\r\n\r\n",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-ambiguous-deny-test.log"));
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
            .uri(format!("https://{sni}/ambiguous"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            "ambiguous TE/content-length response should reset the stream"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_strips_connection_nominated_response_headers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_12121212121212123434343434343434__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: keep-alive, x-foo, x-bar\r\nx-foo: leak\r\nx-bar: leak\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-connection-deny-test.log"));
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
            .uri(format!("https://{sni}/headers"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;

        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().get("connection").is_none());
        assert!(response.headers().get("x-foo").is_none());
        assert!(response.headers().get("x-bar").is_none());
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_rewritten_header_block_over_limit() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_26262626262626264848484848484848__";
        let secret_value = "x".repeat(8 * 1024);
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            &secret_value,
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
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
        let mut builder = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/headers"));
        for index in 0..9 {
            builder = builder.header(format!("x-secret-{index}"), placeholder);
        }
        let request = builder.body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            "rewritten header block over 64 KiB should reset"
        );

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"header_size_exceeded\""),
            "deny log should record header_size_exceeded, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_rewritten_header_line_over_limit() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_27272727272727274949494949494949__";
        let secret_value = "x".repeat(MAX_HEADER_LINE_BYTES);
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            &secret_value,
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
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
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/line"))
            .header("authorization", format!("Bearer {placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            "rewritten header line over 16 KiB should reset"
        );

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"header_size_exceeded\""),
            "deny log should record header_size_exceeded, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_rejects_expect_continue_with_417() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_28282828282828285050505050505050__",
            "sk-real",
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
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
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/expect"))
            .header("expect", "100-continue")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, false)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::EXPECTATION_FAILED);
        assert_eq!(read_h2_body(response.into_body()).await?, b"");

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"expect_continue_unsupported\""),
            "deny log should record expect_continue_unsupported, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_rejects_expect_continue_without_body_data_with_417() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_29292929292929295151515151515151__",
            "sk-real",
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
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
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/expect-empty"))
            .header("expect", "100-continue")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::new(), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::EXPECTATION_FAILED);

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"expect_continue_unsupported\""),
            "deny log should record expect_continue_unsupported, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_denies_non_empty_request_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_30303030303030305252525252525252__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
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
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/trailers"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        let mut trailers = HeaderMap::new();
        trailers.insert("x-trailer", HeaderValue::from_static("value"));
        stream.send_trailers(trailers)?;
        assert!(
            response.await.is_err(),
            "non-empty h2 request trailers should reset the stream"
        );

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"request_trailers_unsupported\""),
            "deny log should record request_trailers_unsupported, got: {deny_log_text}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_accepts_empty_request_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_31313131313131315353535353535353__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let deny_log = Arc::new(PathBuf::from("/tmp/dust-h2-empty-trailers-deny-test.log"));
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
            .uri(format!("https://{sni}/empty-trailers"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        stream.send_trailers(HeaderMap::new())?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n0\r\n\r\n"));

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
    async fn h2_bridge_settings_omit_extended_connect_and_bound_headers() -> Result<()> {
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

        let mut client_io = client_io;
        client_io
            .write_all(b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n")
            .await?;
        client_io.write_all(&[0, 0, 0, 4, 0, 0, 0, 0, 0]).await?;
        let settings = read_h2_settings(&mut client_io).await?;
        assert!(
            settings
                .iter()
                .any(|(id, value)| *id == 0x06 && *value == MAX_HEADER_BLOCK_BYTES as u32),
            "server SETTINGS should bound MAX_HEADER_LIST_SIZE"
        );
        assert!(
            settings.iter().all(|(id, _)| *id != 0x08),
            "server SETTINGS should not advertise ENABLE_CONNECT_PROTOCOL"
        );

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

    #[tokio::test]
    async fn h2_bridge_rejects_protocol_header_list_over_limit_before_handler() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_babababababababacbcbcbcbcbcbcbcb__",
            "sk-real",
            &[sni],
        )?);
        let open_count = Arc::new(AtomicUsize::new(0));
        let (request_tx, _request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_counting_opener(
            Arc::clone(&open_count),
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(512 * 1024);
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
            .uri(format!("https://{sni}/too-many-headers"))
            .header(
                "authorization",
                format!("Bearer {}", "x".repeat(128 * 1024)),
            )
            .body(())?;
        match send_request.send_request(request, true) {
            Ok((response, _stream)) => {
                assert!(
                    response.await.is_err(),
                    "oversized h2 header list should reset before upstream handling"
                );
            }
            Err(_error) => {}
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    fn test_h1_opener(
        request_tx: mpsc::UnboundedSender<String>,
        response: impl Into<Vec<u8>>,
    ) -> OpenH1Upstream {
        let response = Arc::new(response.into());
        Arc::new(move || {
            let request_tx = request_tx.clone();
            let response = Arc::clone(&response);
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
                    upstream_io.write_all(response.as_slice()).await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn test_h1_opener_with_content_length_body(
        request_tx: mpsc::UnboundedSender<String>,
        response: impl Into<Vec<u8>>,
    ) -> OpenH1Upstream {
        let response = Arc::new(response.into());
        Arc::new(move || {
            let request_tx = request_tx.clone();
            let response = Arc::clone(&response);
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
                    upstream_io.write_all(response.as_slice()).await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn test_h1_counting_opener(
        open_count: Arc<AtomicUsize>,
        request_tx: mpsc::UnboundedSender<String>,
        response: impl Into<Vec<u8>>,
    ) -> OpenH1Upstream {
        let response = response.into();
        let opener = test_h1_opener(request_tx, response);
        Arc::new(move || {
            open_count.fetch_add(1, Ordering::SeqCst);
            opener()
        })
    }

    fn test_h1_opener_with_chunked_body(
        request_tx: mpsc::UnboundedSender<String>,
        response: impl Into<Vec<u8>>,
    ) -> OpenH1Upstream {
        let response = Arc::new(response.into());
        Arc::new(move || {
            let request_tx = request_tx.clone();
            let response = Arc::clone(&response);
            Box::pin(async move {
                let (dsbx_io, mut upstream_io) = tokio::io::duplex(64 * 1024);
                tokio::spawn(async move {
                    let mut request = Vec::new();
                    loop {
                        let mut byte = [0_u8; 1];
                        if upstream_io.read_exact(&mut byte).await.is_err() {
                            return Ok::<(), anyhow::Error>(());
                        }
                        request.push(byte[0]);
                        if request.ends_with(b"\r\n\r\n") {
                            break;
                        }
                    }
                    loop {
                        let line = read_test_crlf_line(&mut upstream_io).await?;
                        request.extend_from_slice(&line);
                        let chunk_size = parse_test_chunk_size(&line)?;
                        if chunk_size == 0 {
                            let terminator = read_test_crlf_line(&mut upstream_io).await?;
                            request.extend_from_slice(&terminator);
                            break;
                        }
                        let mut body = vec![0_u8; chunk_size];
                        upstream_io.read_exact(&mut body).await?;
                        request.extend_from_slice(&body);
                        let crlf = read_test_crlf_line(&mut upstream_io).await?;
                        request.extend_from_slice(&crlf);
                    }
                    let request_text = String::from_utf8(request)?;
                    request_tx
                        .send(request_text)
                        .map_err(|_| anyhow!("failed to send captured request"))?;
                    upstream_io.write_all(response.as_slice()).await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    fn test_h1_opener_with_split_chunked_response(
        request_tx: mpsc::UnboundedSender<String>,
        first_write_tx: mpsc::UnboundedSender<()>,
        continue_response: Arc<tokio::sync::Notify>,
        first_part: Vec<u8>,
        second_part: Vec<u8>,
    ) -> OpenH1Upstream {
        let first_part = Arc::new(first_part);
        let second_part = Arc::new(second_part);
        Arc::new(move || {
            let request_tx = request_tx.clone();
            let first_write_tx = first_write_tx.clone();
            let continue_response = Arc::clone(&continue_response);
            let first_part = Arc::clone(&first_part);
            let second_part = Arc::clone(&second_part);
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

                    let total_len = first_part.len() + second_part.len();
                    upstream_io
                        .write_all(
                            format!(
                                "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{total_len:x}\r\n"
                            )
                            .as_bytes(),
                        )
                        .await?;
                    upstream_io.write_all(first_part.as_slice()).await?;
                    first_write_tx
                        .send(())
                        .map_err(|_| anyhow!("failed to signal first response write"))?;
                    continue_response.notified().await;
                    upstream_io.write_all(second_part.as_slice()).await?;
                    upstream_io.write_all(b"\r\n0\r\n\r\n").await?;
                    upstream_io.shutdown().await?;
                    Ok::<(), anyhow::Error>(())
                });
                Ok(Box::new(dsbx_io) as BoxedAsyncReadWrite)
            })
        })
    }

    async fn read_test_crlf_line<R>(reader: &mut R) -> Result<Vec<u8>>
    where
        R: AsyncRead + Unpin,
    {
        let mut line = Vec::new();
        loop {
            let mut byte = [0_u8; 1];
            reader.read_exact(&mut byte).await?;
            line.push(byte[0]);
            if line.ends_with(b"\r\n") {
                return Ok(line);
            }
        }
    }

    fn parse_test_chunk_size(line: &[u8]) -> Result<usize> {
        let text = std::str::from_utf8(line).context("test chunk line should be utf8")?;
        let size = text
            .strip_suffix("\r\n")
            .ok_or_else(|| anyhow!("test chunk line missing CRLF"))?;
        usize::from_str_radix(size, 16).context("invalid test chunk size")
    }

    async fn read_h2_settings<R>(reader: &mut R) -> Result<Vec<(u16, u32)>>
    where
        R: AsyncRead + Unpin,
    {
        loop {
            let mut head = [0_u8; 9];
            reader.read_exact(&mut head).await?;
            let len = ((head[0] as usize) << 16) | ((head[1] as usize) << 8) | head[2] as usize;
            let frame_type = head[3];
            let flags = head[4];
            let mut payload = vec![0_u8; len];
            reader.read_exact(&mut payload).await?;
            if frame_type != 4 || flags & 0x1 != 0 {
                continue;
            }
            ensure!(len % 6 == 0, "invalid SETTINGS payload length");
            return payload
                .chunks_exact(6)
                .map(|setting| {
                    let id = u16::from_be_bytes([setting[0], setting[1]]);
                    let value =
                        u32::from_be_bytes([setting[2], setting[3], setting[4], setting[5]]);
                    Ok((id, value))
                })
                .collect();
        }
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
