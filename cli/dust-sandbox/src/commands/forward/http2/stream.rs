use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use h2::server::SendResponse;
use h2::RecvStream;
use http::header::{CONTENT_LENGTH, COOKIE, HOST, TE};
use http::{HeaderMap, Request};

use crate::egress_secrets::SecretTable;

use super::super::deny_log::{append_deny_log, DenyReason};
use super::super::rewrite_policy::{
    deny_entry, process_request_policy, Authority, HeaderPart, RequestParts, RewriteMode,
};
use super::pool::{H2UpstreamPool, UpstreamLease};
#[cfg(test)]
use super::upstream_h1::handle_h2_to_h1_stream;
use super::upstream_h1::handle_h2_to_h1_upstream;
use super::upstream_h2::{handle_h2_to_h2_stream, validate_header_part_size};
use super::H2UpstreamKey;
#[cfg(test)]
use super::OpenH1Upstream;

#[derive(Clone)]
pub(super) enum UpstreamBridge {
    #[cfg(test)]
    H1 { open_upstream: OpenH1Upstream },
    Pooled {
        pool: H2UpstreamPool,
        key: H2UpstreamKey,
    },
}

pub(super) struct H2BridgeRequest {
    pub(super) method: String,
    pub(super) target: String,
    pub(super) authority: String,
    pub(super) headers: Vec<HeaderPart>,
    pub(super) body: RecvStream,
    pub(super) respond: SendResponse<Bytes>,
}

pub(super) struct H2PolicyContext<'a> {
    pub(super) deny_log: Arc<std::path::PathBuf>,
    pub(super) mode: RewriteMode<'a>,
}

pub(super) async fn handle_h2_stream(
    request: Request<RecvStream>,
    mut respond: SendResponse<Bytes>,
    sni: String,
    secret_table: Arc<SecretTable>,
    deny_log: Arc<std::path::PathBuf>,
    upstream_bridge: UpstreamBridge,
) -> Result<()> {
    let (parts, body) = request.into_parts();
    let method = parts.method.to_string();
    let target = h2_request_target(&parts.uri);
    let mode = RewriteMode::Tls { sni: &sni };
    let authority = match h2_request_authority(&parts.uri, &parts.headers) {
        Ok(authority) => authority,
        Err(error) => {
            let entry = deny_entry(mode, DenyReason::MalformedHeaders, None, None);
            append_deny_log(&deny_log, entry)
                .await
                .context("failed to append h2 malformed-authority deny log entry")?;
            respond.send_reset(h2::Reason::PROTOCOL_ERROR);
            return Err(error);
        }
    };
    if !method.eq_ignore_ascii_case("CONNECT") && parts.uri.scheme_str() != Some("https") {
        let entry = deny_entry(mode, DenyReason::MalformedHeaders, None, Some(&authority));
        append_deny_log(&deny_log, entry)
            .await
            .context("failed to append h2 scheme deny log entry")?;
        respond.send_reset(h2::Reason::PROTOCOL_ERROR);
        return Ok(());
    }
    if let Err(error) = validate_h2_request_headers(&parts.headers, body.is_end_stream()) {
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
    match upstream_bridge {
        #[cfg(test)]
        UpstreamBridge::H1 { open_upstream } => {
            let request = H2BridgeRequest {
                method,
                target,
                authority,
                headers: fold_request_cookies(policy.headers),
                body,
                respond,
            };
            handle_h2_to_h1_stream(request, H2PolicyContext { deny_log, mode }, open_upstream).await
        }
        UpstreamBridge::Pooled { pool, key } => {
            if let Err(deny) = validate_header_part_size(&policy.headers) {
                let entry = deny_entry(mode, deny.reason, None, Some(&authority));
                append_deny_log(&deny_log, entry)
                    .await
                    .context("failed to append h2 request-header deny log entry")?;
                respond.send_reset(deny.reset);
                return Ok(());
            }

            match pool.lease(&key).await {
                Ok(UpstreamLease::Http1(upstream)) => {
                    let request = H2BridgeRequest {
                        method,
                        target,
                        authority,
                        headers: fold_request_cookies(policy.headers),
                        body,
                        respond,
                    };
                    handle_h2_to_h1_upstream(request, H2PolicyContext { deny_log, mode }, upstream)
                        .await
                }
                Ok(UpstreamLease::H2(lease)) => {
                    // Keep h2 cookie fields split; only the h1 fallback folds them
                    // before serializing onto an HTTP/1.1 request.
                    let request = H2BridgeRequest {
                        method,
                        target,
                        authority,
                        headers: policy.headers,
                        body,
                        respond,
                    };
                    handle_h2_to_h2_stream(request, H2PolicyContext { deny_log, mode }, lease).await
                }
                Err(error) => {
                    respond.send_reset(h2::Reason::INTERNAL_ERROR);
                    Err(error).with_context(|| format!("failed to open upstream for {authority}"))
                }
            }
        }
    }
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

pub(super) fn validate_h2_request_headers(
    headers: &HeaderMap,
    body_is_end_stream: bool,
) -> Result<()> {
    let mut content_length_count = 0;
    let mut content_length = None;
    for value in headers.get_all(CONTENT_LENGTH).iter() {
        content_length_count += 1;
        if content_length_count > 1 {
            return Err(anyhow!("duplicate content-length in h2 request"));
        }
        let value = value
            .to_str()
            .context("content-length request header is not visible ASCII")?;
        let parsed = value
            .trim()
            .parse::<u64>()
            .context("invalid content-length request header")?;
        content_length = Some(parsed);
    }
    if body_is_end_stream && content_length.is_some_and(|value| value != 0) {
        return Err(anyhow!("nonzero content-length with end-stream h2 request"));
    }

    validate_h2_te_headers(headers)?;

    Ok(())
}

fn validate_h2_te_headers(headers: &HeaderMap) -> Result<()> {
    for value in headers.get_all(TE).iter() {
        let value = value.to_str().context("te request header is not utf8")?;
        for token in value.split(',') {
            let token = token.trim();
            if token.is_empty() || !token.eq_ignore_ascii_case("trailers") {
                return Err(anyhow!("unsupported h2 te request header"));
            }
        }
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

fn fold_request_cookies(headers: Vec<HeaderPart>) -> Vec<HeaderPart> {
    let mut folded: Vec<HeaderPart> = Vec::with_capacity(headers.len());
    let mut cookie_index = None;

    for header in headers {
        if header.name.eq_ignore_ascii_case(COOKIE.as_str()) {
            match cookie_index {
                Some(index) => {
                    let existing: &mut HeaderPart = &mut folded[index];
                    existing.value.extend_from_slice(b"; ");
                    existing.value.extend_from_slice(&header.value);
                }
                None => {
                    cookie_index = Some(folded.len());
                    folded.push(header);
                }
            }
        } else {
            folded.push(header);
        }
    }

    folded
}

#[cfg(test)]
mod tests {
    use super::super::test_support::*;
    use super::*;

    #[test]
    fn rejects_duplicate_h2_content_length_request_headers() {
        let mut headers = HeaderMap::new();
        headers.append(CONTENT_LENGTH, HeaderValue::from_static("5"));
        headers.append(CONTENT_LENGTH, HeaderValue::from_static("5"));

        let error = validate_h2_request_headers(&headers, false)
            .expect_err("duplicate h2 content-length should be rejected");
        assert!(error.to_string().contains("duplicate content-length"));
    }

    #[test]
    fn rejects_invalid_h2_content_length_request_header() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("5, 5"));

        let error = validate_h2_request_headers(&headers, false)
            .expect_err("invalid h2 content-length should be rejected");
        assert!(error.to_string().contains("invalid content-length"));
    }

    #[test]
    fn rejects_nonzero_h2_content_length_with_end_stream_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("5"));

        let error = validate_h2_request_headers(&headers, true)
            .expect_err("nonzero end-stream h2 content-length should be rejected");
        assert!(error.to_string().contains("nonzero content-length"));
    }

    #[test]
    fn rejects_non_trailers_h2_te_request_header() {
        let mut headers = HeaderMap::new();
        headers.insert(TE, HeaderValue::from_static("gzip"));

        let error = validate_h2_request_headers(&headers, false)
            .expect_err("non-trailers h2 te header should be rejected");
        assert!(error.to_string().contains("unsupported h2 te"));
    }

    #[tokio::test]
    async fn h2_upstream_policy_deny_resets_inbound_stream() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_60606060606060608a8a8a8a8a8a8a8a__";
        let secret_table = Arc::new(secret_table_with_secret(
            "ANTHROPIC_API_KEY",
            placeholder,
            "sk-real",
            &["api.anthropic.com"],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_upstream_pool(Arc::clone(&handshake_count), move |_request, respond| {
            Box::pin(async move {
                send_h2_response(respond, StatusCode::OK, Bytes::from_static(b"ok")).await
            })
        });
        let (mut send_request, connection_task, bridge_task) =
            start_test_h2_upstream_bridge(sni, secret_table, pool).await?;

        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/denied"))
            .header("authorization", format!("Bearer {placeholder}"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(response.await.is_err(), "policy deny should reset stream");
        assert_eq!(handshake_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_upstream_denies_rewritten_header_block_over_limit_before_lease() -> Result<()> {
        let sni = "api.openai.com";
        let placeholder = "__DSEC_71717171717171719a9a9a9a9a9a9a9a__";
        let secret_value = "x".repeat(8 * 1024);
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            placeholder,
            &secret_value,
            &[sni],
        )?);
        let handshake_count = Arc::new(AtomicUsize::new(0));
        let pool = test_h2_upstream_pool(
            Arc::clone(&handshake_count),
            move |_request, mut respond| {
                Box::pin(async move {
                    let response = Response::builder().status(StatusCode::OK).body(())?;
                    respond.send_response(response, true)?;
                    Ok(())
                })
            },
        );
        let tempdir = tempfile::tempdir()?;
        let deny_log = Arc::new(tempdir.path().join("deny.log"));
        let (client_io, server_io) = tokio::io::duplex(64 * 1024);
        let bridge_task = tokio::spawn(run_h2_to_upstream_bridge(
            server_io,
            sni.to_string(),
            secret_table,
            Arc::clone(&deny_log),
            pool,
            test_h2_upstream_key(sni),
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
            "rewritten header block over 64 KiB should reset before upstream lease"
        );

        let deny_log_text =
            read_test_file_after_write(&mut deny_log_write, deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"header_size_exceeded\""),
            "deny log should record header_size_exceeded, got: {deny_log_text}"
        );
        assert_eq!(handshake_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_does_not_open_upstream_on_nonzero_cl_with_end_stream_headers() -> Result<()>
    {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_44444444444444446464646464646464__",
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
            .uri(format!("https://{sni}/bad-length"))
            .header("content-length", "5")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let error = match response.await {
            Ok(_) => {
                return Err(anyhow!(
                    "nonzero end-stream h2 content-length should reset the stream"
                ))
            }
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::PROTOCOL_ERROR);

        assert_eq!(open_count.load(Ordering::SeqCst), 0);

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
        let mut deny_log_write = observe_deny_log_writes(deny_log.as_ref());

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
        let deny_log_text =
            read_test_file_after_write(&mut deny_log_write, deny_log.as_ref()).await?;
        assert!(deny_log_text.contains("\"reason\":\"placeholder_on_non_allowed\""));

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
        let mut deny_log_write = observe_deny_log_writes(deny_log.as_ref());
        let request = Request::builder()
            .method("GET")
            .uri("https://api.anthropic.com/v1/messages")
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(
            response.await.is_err(),
            ":authority/SNI mismatch should reset"
        );

        let deny_log_text =
            read_test_file_after_write(&mut deny_log_write, deny_log.as_ref()).await?;
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
    async fn h2_bridge_rejects_http_scheme_on_tls_session() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_47474747474747476767676767676767__",
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
        let mut deny_log_write = observe_deny_log_writes(deny_log.as_ref());
        let request = Request::builder()
            .method("GET")
            .uri(format!("http://{sni}/plain"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let error = match response.await {
            Ok(_) => return Err(anyhow!("http :scheme should reset the stream")),
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::PROTOCOL_ERROR);

        let deny_log_text =
            read_test_file_after_write(&mut deny_log_write, deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"malformed_headers\""),
            "deny log should record malformed_headers, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }

    #[tokio::test]
    async fn h2_bridge_rejects_unknown_scheme_on_tls_session() -> Result<()> {
        let sni = "api.openai.com";
        let secret_table = Arc::new(secret_table_with_secret(
            "OPENAI_API_KEY",
            "__DSEC_48484848484848486868686868686868__",
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
        let mut deny_log_write = observe_deny_log_writes(deny_log.as_ref());
        let request = Request::builder()
            .method("GET")
            .uri(format!("ftp://{sni}/plain"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        let error = match response.await {
            Ok(_) => return Err(anyhow!("unknown :scheme should reset the stream")),
            Err(error) => error,
        };
        assert_h2_reset_reason(error, h2::Reason::PROTOCOL_ERROR);

        let deny_log_text =
            read_test_file_after_write(&mut deny_log_write, deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"malformed_headers\""),
            "deny log should record malformed_headers, got: {deny_log_text}"
        );
        assert_eq!(open_count.load(Ordering::SeqCst), 0);

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
        let mut deny_log_write = observe_deny_log_writes(deny_log.as_ref());
        let request = Request::builder()
            .method("GET")
            .uri(format!("https://{sni}/v1/{placeholder}/list"))
            .body(())?;
        let (response, _stream) = send_request.send_request(request, true)?;
        assert!(response.await.is_err(), "placeholder in :path should reset");

        let deny_log_text =
            read_test_file_after_write(&mut deny_log_write, deny_log.as_ref()).await?;
        assert!(
            deny_log_text.contains("\"reason\":\"url_line_placeholder\""),
            "deny log should record url_line_placeholder, got: {deny_log_text}"
        );

        drop(send_request);
        connection_task.abort();
        bridge_task.abort();
        Ok(())
    }
}
