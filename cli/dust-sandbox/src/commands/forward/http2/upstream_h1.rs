use std::collections::HashSet;

use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use h2::server::SendResponse;
use h2::{RecvStream, SendStream};
use http::header::{CONTENT_LENGTH, TE, TRANSFER_ENCODING};
use http::{HeaderMap, HeaderName, HeaderValue, Response, StatusCode};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use super::super::deny_log::{append_deny_log, DenyReason};
use super::super::http_framing::{
    find_subslice, is_common_bridge_stripped_header, parse_chunk_size, MAX_HEADER_BLOCK_BYTES,
    MAX_HEADER_LINE_BYTES, MAX_TRAILER_BLOCK_BYTES, READ_CHUNK_BYTES,
};
use super::super::rewrite_policy::{deny_entry, HeaderPart};
use super::stream::{H2BridgeRequest, H2PolicyContext};
#[cfg(test)]
use super::OpenH1Upstream;
use super::{send_data, BoxedAsyncReadWrite, H2RequestDeny};

// Safety cap for one declared h1 chunk. Forwarding still streams chunks in
// READ_CHUNK_BYTES pieces, so this only bounds the largest single chunk an
// upstream is allowed to declare in its framing. 64 MiB is well above any
// chunk an LB or origin we forward through is expected to emit while still
// keeping a hard ceiling against pathological framing.
pub(super) const MAX_H1_RESPONSE_CHUNK_BYTES: usize = 64 * 1024 * 1024;

enum WriteH1RequestError {
    Denied(H2RequestDeny),
    Bridge(anyhow::Error),
}

type WriteH1RequestResult<T> = std::result::Result<T, WriteH1RequestError>;

struct H2H1ForwardRequest {
    method: String,
    authority: String,
    body: RecvStream,
    respond: SendResponse<Bytes>,
    header_bytes: Vec<u8>,
    use_chunked: bool,
}

#[cfg(test)]
pub(super) async fn handle_h2_to_h1_stream(
    mut request: H2BridgeRequest,
    policy: H2PolicyContext<'_>,
    open_upstream: OpenH1Upstream,
) -> Result<()> {
    let (header_bytes, use_chunked) = match build_h1_request_head(
        &request.method,
        &request.target,
        &request.authority,
        &request.headers,
        request.body.is_end_stream(),
    ) {
        Ok(result) => result,
        Err(deny) => {
            let entry = deny_entry(policy.mode, deny.reason, None, Some(&request.authority));
            append_deny_log(&policy.deny_log, entry)
                .await
                .context("failed to append h2 request-header deny log entry")?;
            request.respond.send_reset(deny.reset);
            return Ok(());
        }
    };
    let upstream = match open_upstream().await {
        Ok(upstream) => upstream,
        Err(error) => {
            request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
            return Err(error)
                .with_context(|| format!("failed to open h1 upstream for {}", request.authority));
        }
    };
    forward_h2_to_h1_upstream(
        H2H1ForwardRequest {
            method: request.method,
            authority: request.authority,
            body: request.body,
            respond: request.respond,
            header_bytes,
            use_chunked,
        },
        policy,
        upstream,
    )
    .await
}

pub(super) async fn handle_h2_to_h1_upstream(
    mut request: H2BridgeRequest,
    policy: H2PolicyContext<'_>,
    upstream: BoxedAsyncReadWrite,
) -> Result<()> {
    let (header_bytes, use_chunked) = match build_h1_request_head(
        &request.method,
        &request.target,
        &request.authority,
        &request.headers,
        request.body.is_end_stream(),
    ) {
        Ok(result) => result,
        Err(deny) => {
            let entry = deny_entry(policy.mode, deny.reason, None, Some(&request.authority));
            append_deny_log(&policy.deny_log, entry)
                .await
                .context("failed to append h2 request-header deny log entry")?;
            request.respond.send_reset(deny.reset);
            return Ok(());
        }
    };
    forward_h2_to_h1_upstream(
        H2H1ForwardRequest {
            method: request.method,
            authority: request.authority,
            body: request.body,
            respond: request.respond,
            header_bytes,
            use_chunked,
        },
        policy,
        upstream,
    )
    .await
}

async fn forward_h2_to_h1_upstream(
    mut request: H2H1ForwardRequest,
    policy: H2PolicyContext<'_>,
    upstream: BoxedAsyncReadWrite,
) -> Result<()> {
    let (mut upstream_read, upstream_write) = tokio::io::split(upstream);
    let mut request_task = tokio::spawn(write_h1_request(
        upstream_write,
        request.header_bytes,
        request.use_chunked,
        request.body,
    ));
    let mut response_task = Box::pin(forward_h1_response_to_h2(
        &mut upstream_read,
        &mut request.respond,
        &request.method,
    ));

    tokio::select! {
        request_result = &mut request_task => {
            match request_result.context("h1 request writer task panicked")? {
                Ok(()) => {}
                Err(WriteH1RequestError::Denied(deny)) => {
                    drop(response_task);
                    let entry = deny_entry(policy.mode, deny.reason, None, Some(&request.authority));
                    append_deny_log(&policy.deny_log, entry)
                        .await
                        .context("failed to append h2 request-body deny log entry")?;
                    request.respond.send_reset(deny.reset);
                    return Ok(());
                }
                Err(WriteH1RequestError::Bridge(error)) => {
                    drop(response_task);
                    request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                    return Err(error);
                }
            }

            if let Err(error) = response_task.await {
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error);
            }
        }
        response_result = &mut response_task => {
            drop(response_task);
            if let Err(error) = response_result {
                request_task.abort();
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error);
            }
        }
    }

    Ok(())
}

fn build_h1_request_head(
    method: &str,
    target: &str,
    authority: &str,
    headers: &[HeaderPart],
    body_is_end_stream: bool,
) -> std::result::Result<(Vec<u8>, bool), H2RequestDeny> {
    // Force chunked framing whenever there is a request body stream. We do
    // not know up front whether the h2 client will follow DATA with
    // unsupported trailers, and content-length framing would force us to
    // either pre-buffer the whole upload (memory blowup) or commit the body
    // to the upstream before we can observe trailers. Chunked lets us
    // withhold the h1 terminator if a late deny fires.
    let use_chunked = !body_is_end_stream;
    let mut header_bytes = Vec::new();
    append_h1_head_bytes(
        &mut header_bytes,
        format!("{method} {target} HTTP/1.1\r\n").as_bytes(),
    )?;
    append_h1_header_line(&mut header_bytes, b"Host", authority.as_bytes())?;
    let has_te_trailers = headers
        .iter()
        .any(|header| header.name.eq_ignore_ascii_case(TE.as_str()));
    let connection = if has_te_trailers {
        b"close, te".as_slice()
    } else {
        b"close".as_slice()
    };
    append_h1_header_line(&mut header_bytes, b"Connection", connection)?;
    if use_chunked {
        append_h1_header_line(&mut header_bytes, b"Transfer-Encoding", b"chunked")?;
    }

    for header in headers {
        if header.name.eq_ignore_ascii_case(TE.as_str()) {
            append_h1_header_line(&mut header_bytes, header.name.as_bytes(), &header.value)?;
            continue;
        }
        if should_strip_h1_bridge_header(&header.name)
            || (use_chunked && header.name.eq_ignore_ascii_case(CONTENT_LENGTH.as_str()))
        {
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
    mut upstream: W,
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
    upstream
        .flush()
        .await
        .context("failed to flush h1 request headers")
        .map_err(WriteH1RequestError::Bridge)?;

    while let Some(chunk) = body.data().await {
        let chunk = chunk
            .context("failed to read h2 request body chunk")
            .map_err(WriteH1RequestError::Bridge)?;
        if chunk.is_empty() {
            body.flow_control()
                .release_capacity(chunk.len())
                .context("failed to release h2 request flow-control capacity")
                .map_err(WriteH1RequestError::Bridge)?;
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
        upstream
            .flush()
            .await
            .context("failed to flush h1 request body chunk")
            .map_err(WriteH1RequestError::Bridge)?;
        body.flow_control()
            .release_capacity(chunk.len())
            .context("failed to release h2 request flow-control capacity")
            .map_err(WriteH1RequestError::Bridge)?;
    }

    if let Some(trailers) = body
        .trailers()
        .await
        .context("failed to read h2 trailers")
        .map_err(WriteH1RequestError::Bridge)?
    {
        if !trailers.is_empty() {
            return Err(WriteH1RequestError::Denied(H2RequestDeny::internal(
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
    is_common_bridge_stripped_header(name) || name.eq_ignore_ascii_case("te")
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
    let response_head = loop {
        let response_head = reader
            .read_response_head()
            .await
            .context("failed to read h1 response head")?;
        if !response_head.status.is_informational() {
            break response_head;
        }
        let response = build_h2_response_head(&response_head)?;
        respond
            .send_informational(response)
            .context("failed to send h2 informational response head")?;
    };
    let no_body = response_has_no_body(request_method, response_head.status);
    let response = build_h2_response_head(&response_head)?;

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

fn build_h2_response_head(response_head: &H1ResponseHead) -> Result<Response<()>> {
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
    Ok(response)
}

pub(super) fn response_has_no_body(request_method: &str, status: StatusCode) -> bool {
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
pub(super) enum H1BodyKind {
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

pub(super) fn response_body_kind(headers: &[HeaderPart]) -> Result<H1BodyKind> {
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

#[cfg(test)]
mod tests {
    use super::super::test_support::*;
    use super::*;

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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
    async fn h2_bridge_folds_split_cookie_headers_into_single_h1_cookie() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_41414141414141416161616161616161__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
            .uri(format!("https://{sni}/cookies"))
            .header("cookie", "a=1")
            .header("cookie", "b=2")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert_eq!(h1_header_values(&request_text, "cookie"), vec!["a=1; b=2"]);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_folds_split_cookie_headers_after_dsec_substitution() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_42424242424242426262626262626262__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "cookie-secret",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
            .uri(format!("https://{sni}/cookies"))
            .header("cookie", "a=1")
            .header("cookie", format!("session={placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert_eq!(
            h1_header_values(&request_text, "cookie"),
            vec!["a=1; session=cookie-secret"]
        );
        assert!(!request_text.contains(placeholder));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_passes_through_single_cookie_header() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_43434343434343436363636363636363__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
            .uri(format!("https://{sni}/cookies"))
            .header("cookie", "a=1")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert_eq!(h1_header_values(&request_text, "cookie"), vec!["a=1"]);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_forces_chunked_on_streaming_request_with_content_length() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_0123456789abcdef0123456789abcdef__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(!request_text
            .to_ascii_lowercase()
            .contains("content-length:"));
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n0\r\n\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_end_stream_with_content_length_keeps_content_length() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_32323232323232325454545454545454__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
            .uri(format!("https://{sni}/empty-upload"))
            .header("content-length", "0")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("POST /empty-upload HTTP/1.1\r\n"));
        assert!(request_text.contains("content-length: 0\r\n"));
        assert!(!request_text.contains("Transfer-Encoding: chunked\r\n"));

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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
        let mut deny_log_write = observe_deny_log_writes(deny_log.as_ref());
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

        let deny_log_text =
            read_test_file_after_write(&mut deny_log_write, deny_log.as_ref()).await?;
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
        let mut deny_log_write = observe_deny_log_writes(deny_log.as_ref());
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

        let deny_log_text =
            read_test_file_after_write(&mut deny_log_write, deny_log.as_ref()).await?;
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
    async fn h2_bridge_forwards_expect_continue_and_100_response() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_28282828282828285050505050505050__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_expect_continue(request_tx);
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
        let (mut response, mut stream) = send_request.send_request(request, false)?;
        let informational = next_informational(&mut response).await?;
        assert_eq!(informational.status(), StatusCode::CONTINUE);
        assert_eq!(
            informational.headers().get("x-info"),
            Some(&HeaderValue::from_static("yes"))
        );
        stream.send_data(Bytes::from_static(b"hello"), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("expect: 100-continue\r\n"));
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n0\r\n\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_returns_early_final_response_while_client_uploads() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_29292929292929295151515151515151__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_early_final_response(request_tx);
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
            .uri(format!("https://{sni}/early"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        let response = tokio::time::timeout(std::time::Duration::from_secs(1), response)
            .await
            .context("bridge did not forward early final h1 response")??;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"early");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.contains("POST /early HTTP/1.1\r\n"));
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_preserves_te_trailers_and_maps_h1_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_56565656565656567878787878787878__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_with_chunked_body(
            request_tx,
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n0\r\nx-done: yes\r\n\r\n",
        );

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
            .uri(format!("https://{sni}/trailers"))
            .header("te", "trailers")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

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

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert_eq!(h1_header_values(&request_text, "te"), vec!["trailers"]);
        assert_eq!(
            h1_header_values(&request_text, "connection"),
            vec!["close, te"]
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_streams_request_and_response_data_bidirectionally() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_57575757575757577979797979797979__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_bidirectional_stream(request_tx);

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
            .uri(format!("https://{sni}/duplex"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"one"), false)?;
        let response = tokio::time::timeout(std::time::Duration::from_secs(1), response)
            .await
            .context("bridge did not forward response head after first upload chunk")??;
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();
        let first = tokio::time::timeout(std::time::Duration::from_secs(1), body.data())
            .await
            .context("bridge did not forward response data before upload ended")?
            .ok_or_else(|| anyhow!("h2 response ended before first data"))??;
        assert_eq!(first, Bytes::from_static(b"ack-one"));
        body.flow_control().release_capacity(first.len())?;

        stream.send_data(Bytes::from_static(b"two"), true)?;
        let second = tokio::time::timeout(std::time::Duration::from_secs(1), body.data())
            .await
            .context("bridge did not forward second response data after second upload chunk")?
            .ok_or_else(|| anyhow!("h2 response ended before second data"))??;
        assert_eq!(second, Bytes::from_static(b"ack-two"));
        body.flow_control().release_capacity(second.len())?;
        loop {
            let end = tokio::time::timeout(std::time::Duration::from_secs(1), body.data())
                .await
                .context("h2 response did not end after second response data")?;
            match end {
                Some(Ok(chunk)) if chunk.is_empty() => {}
                Some(Ok(chunk)) => {
                    return Err(anyhow!("unexpected extra response data: {chunk:?}"))
                }
                Some(Err(error)) => return Err(error.into()),
                None => break,
            }
        }
        ensure!(body.trailers().await?.is_none(), "unexpected trailers");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive request"))?;
        assert!(request_text.ends_with("\r\n\r\n3\r\none\r\n3\r\ntwo\r\n0\r\n\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_h1_alpn_fallback_uses_full_duplex_h1_path() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_62626262626262628c8c8c8c8c8c8c8c__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let pool = test_h1_fallback_pool(
            request_tx,
            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/fallback"))
            .header("cookie", "a=1")
            .header("cookie", "b=2")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream did not receive h1 request"))?;
        assert!(request_text.contains("GET /fallback HTTP/1.1\r\n"));
        assert_eq!(h1_header_values(&request_text, "cookie"), vec!["a=1; b=2"]);

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
        let error = match response.await {
            Ok(_) => {
                return Err(anyhow!(
                    "non-empty h2 request trailers should reset the stream"
                ))
            }
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::INTERNAL_ERROR);

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
    async fn h2_bridge_denies_trailers_with_content_length() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_34343434343434345656565656565656__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_capture_until_eof(request_tx);
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
            .uri(format!("https://{sni}/trailers-with-length"))
            .header("content-length", "5")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        let mut trailers = HeaderMap::new();
        trailers.insert("x-trailer", HeaderValue::from_static("value"));
        stream.send_trailers(trailers)?;
        let error = match response.await {
            Ok(_) => {
                return Err(anyhow!(
                    "content-length plus non-empty h2 trailers should reset the stream"
                ))
            }
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::INTERNAL_ERROR);

        let deny_log_text = tokio::fs::read_to_string(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"request_trailers_unsupported\""),
            "deny log should record request_trailers_unsupported, got: {deny_log_text}"
        );
        let request_text = request_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("test upstream capture channel closed"))?;
        assert!(request_text.contains("POST /trailers-with-length HTTP/1.1\r\n"));
        assert!(request_text.contains("Transfer-Encoding: chunked\r\n"));
        assert!(!request_text
            .to_ascii_lowercase()
            .contains("content-length:"));
        assert!(request_text.ends_with("\r\n\r\n5\r\nhello\r\n"));

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_does_not_complete_request_on_cl_overflow() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_45454545454545456565656565656565__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_capture_until_eof(request_tx);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
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
            .uri(format!("https://{sni}/length-overflow"))
            .header("content-length", "5")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello!"), true)?;
        let error = match response.await {
            Ok(_) => return Err(anyhow!("content-length overflow should reset the stream")),
            Err(error) => error,
        };
        assert_h2_reset(error);
        assert_no_complete_chunked_request(&mut request_rx).await?;

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_does_not_complete_request_on_cl_underflow() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_46464646464646466666666666666666__",
            "sk-real",
            &[sni],
        )?);
        let (request_tx, mut request_rx) = mpsc::unbounded_channel();
        let opener = test_h1_opener_capture_until_eof(request_tx);
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));

        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
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
            .uri(format!("https://{sni}/length-underflow"))
            .header("content-length", "5")
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hey"), true)?;
        let error = match response.await {
            Ok(_) => return Err(anyhow!("content-length underflow should reset the stream")),
            Err(error) => error,
        };
        assert_h2_reset(error);
        assert_no_complete_chunked_request(&mut request_rx).await?;

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
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
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
}
