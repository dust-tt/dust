use std::future::{poll_fn, Future};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use bytes::Bytes;
use h2::client::ResponseFuture;
use h2::server::SendResponse;
use h2::{RecvStream, SendStream};
use http::{HeaderMap, HeaderName, HeaderValue, Request, Response};
use tokio::sync::Mutex;

use super::super::deny_log::{append_deny_log, DenyReason};
use super::super::http_framing::{
    is_common_bridge_stripped_header, MAX_HEADER_BLOCK_BYTES, MAX_HEADER_LINE_BYTES,
};
use super::super::rewrite_policy::{deny_entry, HeaderPart};
use super::pool::H2ConnectionLease;
use super::stream::{H2BridgeRequest, H2PolicyContext};
use super::upstream_h1::response_has_no_body;
use super::{send_data, H2RequestDeny, H2_REQUEST_DENY_POLL_TIMEOUT_MS};

type H2RequestDenySlot = Arc<Mutex<Option<H2RequestDeny>>>;

async fn store_h2_request_body_deny(slot: &H2RequestDenySlot, deny: H2RequestDeny) {
    let mut slot = slot.lock().await;
    *slot = Some(deny);
}

async fn take_h2_request_body_deny(slot: &H2RequestDenySlot) -> Option<H2RequestDeny> {
    let mut slot = slot.lock().await;
    slot.take()
}

async fn handle_h2_request_body_deny(
    policy: &H2PolicyContext<'_>,
    respond: &mut SendResponse<Bytes>,
    authority: &str,
    deny: H2RequestDeny,
) -> Result<()> {
    let entry = deny_entry(policy.mode, deny.reason, None, Some(authority));
    append_deny_log(&policy.deny_log, entry)
        .await
        .context("failed to append h2 request-body deny log entry")?;
    respond.send_reset(deny.reset);
    Ok(())
}

enum ForwardH2RequestBodyResult {
    Complete,
    InboundReset,
}

enum ForwardH2RequestBodyError {
    InboundReset,
    Denied(H2RequestDeny),
    Bridge(anyhow::Error),
}

pub(super) async fn handle_h2_to_h2_stream(
    mut request: H2BridgeRequest,
    policy: H2PolicyContext<'_>,
    lease: H2ConnectionLease,
) -> Result<()> {
    let body_is_end_stream = request.body.is_end_stream();
    let outbound_request = match build_h2_upstream_request(
        &request.method,
        &request.target,
        &request.authority,
        &request.headers,
    ) {
        Ok(request) => request,
        Err(deny) => {
            let entry = deny_entry(policy.mode, deny.reason, None, Some(&request.authority));
            append_deny_log(&policy.deny_log, entry)
                .await
                .context("failed to append h2 upstream request deny log entry")?;
            request.respond.send_reset(deny.reset);
            return Ok(());
        }
    };

    let mut send_request = lease.send_request();
    let (response, send_stream) =
        match send_request.send_request(outbound_request, body_is_end_stream) {
            Ok(result) => result,
            Err(error) => {
                lease.mark_closed();
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error).context("failed to send outbound h2 request head");
            }
        };

    if body_is_end_stream {
        if let Err(error) =
            forward_h2_response_to_h2(response, &mut request.respond, &request.method).await
        {
            request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
            return Err(error);
        }
        drop(send_stream);
        drop(lease);
        return Ok(());
    }

    let request_body_deny = Arc::new(Mutex::new(None));
    let mut request_task = tokio::spawn(forward_h2_request_body(
        request.body,
        send_stream,
        Arc::clone(&request_body_deny),
    ));
    let mut response_task = Box::pin(forward_h2_response_to_h2(
        response,
        &mut request.respond,
        &request.method,
    ));

    tokio::select! {
        request_result = &mut request_task => {
            match request_result.context("h2 request forward task panicked")? {
                Ok(ForwardH2RequestBodyResult::Complete) => {}
                Ok(ForwardH2RequestBodyResult::InboundReset) => {
                    drop(response_task);
                    return Ok(());
                }
                Err(ForwardH2RequestBodyError::InboundReset) => {
                    drop(response_task);
                    return Ok(());
                }
                Err(ForwardH2RequestBodyError::Denied(deny)) => {
                    drop(response_task);
                    handle_h2_request_body_deny(
                        &policy,
                        &mut request.respond,
                        &request.authority,
                        deny,
                    )
                    .await?;
                    return Ok(());
                }
                Err(ForwardH2RequestBodyError::Bridge(error)) => {
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
                if let Some(deny) = take_h2_request_body_deny(&request_body_deny).await {
                    request_task.abort();
                    handle_h2_request_body_deny(
                        &policy,
                        &mut request.respond,
                        &request.authority,
                        deny,
                    )
                    .await?;
                    return Ok(());
                }
                match tokio::time::timeout(
                    Duration::from_millis(H2_REQUEST_DENY_POLL_TIMEOUT_MS),
                    &mut request_task,
                )
                .await
                {
                    Ok(request_result) => {
                        match request_result.context("h2 request forward task panicked")? {
                            Ok(ForwardH2RequestBodyResult::Complete) => {
                                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                                return Err(error);
                            }
                            Ok(ForwardH2RequestBodyResult::InboundReset)
                            | Err(ForwardH2RequestBodyError::InboundReset) => return Ok(()),
                            Err(ForwardH2RequestBodyError::Denied(deny)) => {
                                handle_h2_request_body_deny(
                                    &policy,
                                    &mut request.respond,
                                    &request.authority,
                                    deny,
                                )
                                .await?;
                                return Ok(());
                            }
                            Err(ForwardH2RequestBodyError::Bridge(request_error)) => {
                                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                                return Err(request_error);
                            }
                        }
                    }
                    Err(_) => {
                        if let Some(deny) = take_h2_request_body_deny(&request_body_deny).await {
                            request_task.abort();
                            handle_h2_request_body_deny(
                                &policy,
                                &mut request.respond,
                                &request.authority,
                                deny,
                            )
                            .await?;
                            return Ok(());
                        }
                    }
                }
                request_task.abort();
                request.respond.send_reset(h2::Reason::INTERNAL_ERROR);
                return Err(error);
            }
            request_task.abort();
        }
    }

    Ok(())
}

pub(super) fn validate_header_part_size(
    headers: &[HeaderPart],
) -> std::result::Result<(), H2RequestDeny> {
    let mut total = 0;
    for header in headers {
        let line_len = header.name.len() + b": ".len() + header.value.len() + b"\r\n".len();
        if line_len > MAX_HEADER_LINE_BYTES {
            return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
        }
        total += line_len;
        if total > MAX_HEADER_BLOCK_BYTES {
            return Err(H2RequestDeny::internal(DenyReason::HeaderSizeExceeded));
        }
    }

    Ok(())
}

fn build_h2_upstream_request(
    method: &str,
    target: &str,
    authority: &str,
    headers: &[HeaderPart],
) -> std::result::Result<Request<()>, H2RequestDeny> {
    let uri = format!("https://{authority}{target}");
    let mut request = Request::builder()
        .version(http::Version::HTTP_2)
        .method(method)
        .uri(uri);
    for header in headers {
        if should_strip_h2_upstream_header(&header.name) {
            continue;
        }
        let name = HeaderName::from_bytes(header.name.as_bytes())
            .map_err(|_| H2RequestDeny::internal(DenyReason::MalformedHeaders))?;
        let value = HeaderValue::from_bytes(&header.value)
            .map_err(|_| H2RequestDeny::internal(DenyReason::MalformedHeaders))?;
        request = request.header(name, value);
    }

    request
        .body(())
        .map_err(|_| H2RequestDeny::internal(DenyReason::MalformedHeaders))
}

fn should_strip_h2_upstream_header(name: &str) -> bool {
    is_common_bridge_stripped_header(name)
}

async fn forward_h2_request_body(
    mut inbound: RecvStream,
    mut outbound: SendStream<Bytes>,
    denied: H2RequestDenySlot,
) -> std::result::Result<ForwardH2RequestBodyResult, ForwardH2RequestBodyError> {
    while let Some(chunk) = inbound.data().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(error) if error.is_reset() => {
                outbound.send_reset(error.reason().unwrap_or(h2::Reason::CANCEL));
                return Ok(ForwardH2RequestBodyResult::InboundReset);
            }
            Err(error) => return Err(ForwardH2RequestBodyError::Bridge(error.into())),
        };
        let len = chunk.len();
        if len != 0 {
            send_data(&mut outbound, chunk, false)
                .await
                .map_err(ForwardH2RequestBodyError::Bridge)?;
        }
        inbound
            .flow_control()
            .release_capacity(len)
            .map_err(|error| ForwardH2RequestBodyError::Bridge(error.into()))?;
    }

    let trailers = inbound.trailers().await.map_err(|error| {
        if error.is_reset() {
            ForwardH2RequestBodyError::InboundReset
        } else {
            ForwardH2RequestBodyError::Bridge(error.into())
        }
    })?;
    if let Some(trailers) = trailers {
        if !trailers.is_empty() {
            let deny = H2RequestDeny::internal(DenyReason::RequestTrailersUnsupported);
            store_h2_request_body_deny(&denied, deny).await;
            outbound.send_reset(h2::Reason::INTERNAL_ERROR);
            return Err(ForwardH2RequestBodyError::Denied(deny));
        }
        send_data(&mut outbound, Bytes::new(), true)
            .await
            .map_err(ForwardH2RequestBodyError::Bridge)?;
    } else {
        send_data(&mut outbound, Bytes::new(), true)
            .await
            .map_err(ForwardH2RequestBodyError::Bridge)?;
    }

    Ok(ForwardH2RequestBodyResult::Complete)
}

enum UpstreamResponseEvent {
    Informational(Response<()>),
    Final(Response<RecvStream>),
}

async fn next_upstream_response_event(
    response: &mut ResponseFuture,
) -> Result<UpstreamResponseEvent> {
    poll_fn(|cx| {
        if let std::task::Poll::Ready(Some(result)) = response.poll_informational(cx) {
            return std::task::Poll::Ready(
                result
                    .map(UpstreamResponseEvent::Informational)
                    .map_err(anyhow::Error::from),
            );
        }
        match Pin::new(&mut *response).poll(cx) {
            std::task::Poll::Ready(result) => std::task::Poll::Ready(
                result
                    .map(UpstreamResponseEvent::Final)
                    .map_err(anyhow::Error::from),
            ),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    })
    .await
}

async fn forward_h2_response_to_h2(
    mut response: ResponseFuture,
    respond: &mut SendResponse<Bytes>,
    request_method: &str,
) -> Result<()> {
    let final_response = loop {
        match next_upstream_response_event(&mut response).await? {
            UpstreamResponseEvent::Informational(response) => {
                let response = sanitize_h2_response_head(response)?;
                respond
                    .send_informational(response)
                    .context("failed to send downstream h2 informational response")?;
            }
            UpstreamResponseEvent::Final(response) => break response,
        }
    };
    let status = final_response.status();
    let no_body = response_has_no_body(request_method, status);
    let (parts, mut upstream_body) = final_response.into_parts();
    let response_is_end_stream = upstream_body.is_end_stream();
    let response = sanitize_h2_response_head(Response::from_parts(parts, ()))?;

    if no_body || response_is_end_stream {
        respond
            .send_response(response, true)
            .context("failed to send downstream h2 response head")?;
        return Ok(());
    }

    let mut downstream = respond
        .send_response(response, false)
        .context("failed to send downstream h2 response head")?;
    while let Some(chunk) = upstream_body.data().await {
        let chunk = chunk.context("failed to read upstream h2 response data")?;
        let len = chunk.len();
        if len != 0 {
            send_data(&mut downstream, chunk, false).await?;
        }
        upstream_body
            .flow_control()
            .release_capacity(len)
            .context("failed to release upstream h2 response capacity")?;
    }

    if let Some(trailers) = upstream_body
        .trailers()
        .await
        .context("failed to read upstream h2 response trailers")?
    {
        downstream
            .send_trailers(filter_h2_header_map(trailers))
            .context("failed to send downstream h2 response trailers")?;
    } else {
        send_data(&mut downstream, Bytes::new(), true).await?;
    }

    Ok(())
}

fn sanitize_h2_response_head<B>(response: Response<B>) -> Result<Response<()>> {
    let (parts, _) = response.into_parts();
    let mut builder = Response::builder().status(parts.status);
    for (name, value) in &parts.headers {
        if should_strip_h2_upstream_header(name.as_str()) {
            continue;
        }
        builder = builder.header(name, value);
    }
    builder
        .body(())
        .context("failed to build sanitized h2 response head")
}

pub(super) fn filter_h2_header_map(headers: HeaderMap) -> HeaderMap {
    let mut filtered = HeaderMap::new();
    let mut last_name = None;
    for (name, value) in headers {
        if let Some(name) = name {
            last_name = Some(name.clone());
            if should_strip_h2_upstream_header(name.as_str()) {
                continue;
            }
            filtered.append(name, value);
        } else if let Some(name) = &last_name {
            if should_strip_h2_upstream_header(name.as_str()) {
                continue;
            }
            filtered.append(name.clone(), value);
        }
    }
    filtered
}

#[cfg(test)]
mod tests {
    use super::super::test_support::*;
    use super::*;

    #[test]
    fn filter_h2_header_map_preserves_repeated_values() {
        let mut headers = HeaderMap::new();
        headers.append("x-foo", HeaderValue::from_static("a"));
        headers.append("x-foo", HeaderValue::from_static("b"));

        let filtered = filter_h2_header_map(headers);
        let values = filtered
            .get_all("x-foo")
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>();

        assert_eq!(values, vec![b"a".to_vec(), b"b".to_vec()]);
    }

    #[tokio::test]
    async fn h2_upstream_substitutes_headers_without_folding_cookies() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_59595959595959597b7b7b7b7b7b7b7b__";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (headers_tx, mut headers_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, respond| {
            let headers_tx = headers_tx.clone();
            Box::pin(async move {
                let auth = request
                    .headers()
                    .get("authorization")
                    .ok_or_else(|| anyhow!("missing authorization header"))?
                    .as_bytes()
                    .to_vec();
                let cookies = request
                    .headers()
                    .get_all("cookie")
                    .iter()
                    .map(|value| value.as_bytes().to_vec())
                    .collect::<Vec<_>>();
                headers_tx
                    .send((auth, cookies))
                    .map_err(|_| anyhow!("failed to send upstream headers"))?;
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });

        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/headers"))
            .header("authorization", format!("Bearer {placeholder}"))
            .header("cookie", "a=1")
            .header("cookie", format!("session={placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);

        let (auth, cookies) = headers_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("missing upstream headers"))?;
        assert_eq!(auth, b"Bearer sk-real");
        assert_eq!(cookies, vec![b"a=1".to_vec(), b"session=sk-real".to_vec()]);
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_inbound_reset_propagates_without_closing_sibling() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_63636363636363638d8d8d8d8d8d8d8d__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (reset_tx, mut reset_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, respond| {
            let reset_tx = reset_tx.clone();
            Box::pin(async move {
                if request.uri().path() == "/reset" {
                    let mut body = request.into_body();
                    let error = loop {
                        let Some(result) = body.data().await else {
                            return Err(anyhow!("missing upstream reset"));
                        };
                        match result {
                            Ok(chunk) => {
                                body.flow_control().release_capacity(chunk.len())?;
                            }
                            Err(error) => break error,
                        }
                    };
                    reset_tx
                        .send(error.reason())
                        .map_err(|_| anyhow!("failed to send reset reason"))?;
                    return Ok(());
                }

                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let reset_request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/reset"))
            .body(())?;
        let (_reset_response, mut reset_stream) =
            send_request.send_request(reset_request, false)?;
        reset_stream.send_data(Bytes::from_static(b"hello"), false)?;
        reset_stream.send_reset(h2::Reason::CANCEL);

        let sibling = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/sibling"))
            .body(())?;
        let (sibling_response, _stream) = send_request.send_request(sibling, true)?;
        let sibling_response = sibling_response.await?;
        assert_eq!(sibling_response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(sibling_response.into_body()).await?, b"ok");

        assert_eq!(
            reset_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("missing reset reason"))?,
            Some(h2::Reason::CANCEL)
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_forwards_informational_headers_and_trailers() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_65656565656565658f8f8f8f8f8f8f8f__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_upstream_pool(
            Arc::clone(&handshake_count),
            move |_request, mut respond| {
                Box::pin(async move {
                    let informational = Response::builder()
                        .status(StatusCode::CONTINUE)
                        .header("x-info", "yes")
                        .body(())?;
                    respond.send_informational(informational)?;
                    let response = Response::builder().status(StatusCode::OK).body(())?;
                    let mut send = respond.send_response(response, false)?;
                    send_data(&mut send, Bytes::from_static(b"ok"), false).await?;
                    let mut trailers = HeaderMap::new();
                    trailers.insert("x-done", HeaderValue::from_static("yes"));
                    send.send_trailers(trailers)?;
                    Ok(())
                })
            },
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/info"))
            .body(())?;
        let (mut response, _stream) = send_request.send_request(request, true)?;
        let informational = next_informational(&mut response).await?;
        assert_eq!(informational.status(), StatusCode::CONTINUE);
        assert_eq!(
            informational.headers().get("x-info"),
            Some(&HeaderValue::from_static("yes"))
        );
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();
        let data = body
            .data()
            .await
            .ok_or_else(|| anyhow!("missing response data"))??;
        assert_eq!(data, Bytes::from_static(b"ok"));
        body.flow_control().release_capacity(data.len())?;
        let trailers = body
            .trailers()
            .await?
            .ok_or_else(|| anyhow!("missing response trailers"))?;
        assert_eq!(
            trailers.get("x-done"),
            Some(&HeaderValue::from_static("yes"))
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_to_h2_response_trailers_with_repeated_values_round_trip() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_67676767676767679090909090909090__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_upstream_pool(
            Arc::clone(&handshake_count),
            move |_request, mut respond| {
                Box::pin(async move {
                    let response = Response::builder().status(StatusCode::OK).body(())?;
                    let mut send = respond.send_response(response, false)?;
                    send_data(&mut send, Bytes::from_static(b"ok"), false).await?;
                    let mut trailers = HeaderMap::new();
                    trailers.append("x-foo", HeaderValue::from_static("a"));
                    trailers.append("x-foo", HeaderValue::from_static("b"));
                    send.send_trailers(trailers)?;
                    Ok(())
                })
            },
        );
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/trailers"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();
        let data = body
            .data()
            .await
            .ok_or_else(|| anyhow!("missing response data"))??;
        assert_eq!(data, Bytes::from_static(b"ok"));
        body.flow_control().release_capacity(data.len())?;
        let trailers = body
            .trailers()
            .await?
            .ok_or_else(|| anyhow!("missing response trailers"))?;
        let values = trailers
            .get_all("x-foo")
            .iter()
            .map(|value| value.as_bytes().to_vec())
            .collect::<Vec<_>>();
        assert_eq!(values, vec![b"a".to_vec(), b"b".to_vec()]);
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_to_h2_request_trailers_reset_inbound_stream() -> Result<()> {
        run_h2_to_h2_request_trailers_reset_inbound_stream().await
    }

    #[tokio::test]
    async fn h2_to_h2_request_trailers_reset_inbound_stream_is_stable() -> Result<()> {
        for _ in 0..50 {
            run_h2_to_h2_request_trailers_reset_inbound_stream().await?;
        }
        Ok(())
    }

    async fn run_h2_to_h2_request_trailers_reset_inbound_stream() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_68686868686868689191919191919191__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (observed_tx, mut observed_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, _respond| {
            let observed_tx = observed_tx.clone();
            Box::pin(async move {
                let observed = observe_h2_request_body_close(request.into_body()).await?;
                observed_tx
                    .send(observed)
                    .map_err(|_| anyhow!("failed to send upstream trailer observation"))?;
                Ok(())
            })
        });
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let key = H2UpstreamKey::new(
            sni.to_string(),
            std::net::SocketAddr::from(([127, 0, 0, 1], 443)),
        );
        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_upstream_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            pool,
            key,
        ));
        let (mut send_request, connection) = h2::client::handshake(client_io).await?;
        let connection_task = tokio::spawn(connection);
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/request-trailers"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        let mut trailers = HeaderMap::new();
        trailers.insert("x-trailer", HeaderValue::from_static("value"));
        stream.send_trailers(trailers)?;
        let error = match response.await {
            Ok(_) => {
                return Err(anyhow!(
                    "non-empty h2 to h2 request trailers should reset the inbound stream"
                ))
            }
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::INTERNAL_ERROR);

        let observed = tokio::time::timeout(std::time::Duration::from_secs(1), observed_rx.recv())
            .await
            .context("timed out waiting for upstream stream closure")?
            .ok_or_else(|| anyhow!("upstream trailer observation channel closed"))?;
        assert!(
            !observed.trailers_seen,
            "upstream should not receive trailers"
        );
        assert_eq!(
            observed.reset_reason,
            Some(h2::Reason::INTERNAL_ERROR),
            "upstream stream should be reset after denied request trailers"
        );
        let deny_log_text = read_test_file_eventually(deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"request_trailers_unsupported\""),
            "deny log should record request_trailers_unsupported, got: {deny_log_text}"
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_to_h2_empty_request_trailers_ignored() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_69696969696969699292929292929292__",
            "sk-real",
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let (observed_tx, mut observed_rx) = mpsc::unbounded_channel();
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |request, respond| {
            let observed_tx = observed_tx.clone();
            Box::pin(async move {
                let observed = observe_h2_request_body_close(request.into_body()).await?;
                observed_tx
                    .send(observed)
                    .map_err(|_| anyhow!("failed to send upstream trailer observation"))?;
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;
        let request = Request::builder()
            .method("POST")
            .uri(format!("https://{sni}/empty-request-trailers"))
            .body(())?;
        let (response, mut stream) = send_request.send_request(request, false)?;
        stream.send_data(Bytes::from_static(b"hello"), false)?;
        stream.send_trailers(HeaderMap::new())?;
        let response = response.await?;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(read_h2_body(response.into_body()).await?, b"ok");

        let observed = observed_rx
            .recv()
            .await
            .ok_or_else(|| anyhow!("missing upstream trailer observation"))?;
        assert!(
            !observed.trailers_seen,
            "empty trailers should not be forwarded"
        );
        assert_eq!(observed.reset_reason, None);
        assert_eq!(handshake_count.load(Ordering::SeqCst), 1);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }
}
