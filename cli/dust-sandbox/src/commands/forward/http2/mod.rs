mod inbound;
mod pool;
mod stream;
#[cfg(test)]
mod test_support;
mod upstream_h1;
mod upstream_h2;

use std::future::{poll_fn, Future};
use std::pin::Pin;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use h2::SendStream;
use tokio::io::{AsyncRead, AsyncWrite};

use super::deny_log::DenyReason;
use super::http_framing::READ_CHUNK_BYTES;

#[cfg(test)]
pub(super) use inbound::run_h2_to_h1_bridge;
pub(super) use inbound::run_h2_to_upstream_bridge;
pub(super) use pool::{H2UpstreamKey, H2UpstreamPool};

const H2_MAX_CONCURRENT_STREAMS: u32 = 256;
// 1 MiB initial window for h2 streams on both sides. The h2 spec default
// (64 KiB - 1) throttles single uploads to one round-trip per window; 1 MiB
// keeps large request/response bodies flowing without explicit WINDOW_UPDATEs
// dominating wall-clock latency.
const H2_INITIAL_WINDOW_SIZE: u32 = 1_048_576;
const H2_REQUEST_DENY_POLL_TIMEOUT_MS: u64 = 50;

pub(super) trait AsyncReadWrite: AsyncRead + AsyncWrite + Unpin + Send {}

impl<T> AsyncReadWrite for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

pub(super) type BoxedAsyncReadWrite = Box<dyn AsyncReadWrite>;
// The authority is intentionally not a parameter: every h2 stream on a session
// has already been gated by `process_request_policy` to match the session SNI,
// so opening upstream means opening the SNI's upstream. The opener captures
// the SNI itself; passing it back in would be redundant and would invite a
// future relaxation of the policy gate to silently bypass the SNI binding.
#[cfg(test)]
pub(super) type OpenH1Upstream = Arc<
    dyn Fn() -> Pin<Box<dyn Future<Output = Result<BoxedAsyncReadWrite>> + Send>> + Send + Sync,
>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum UpstreamProtocol {
    H2,
    Http1,
}

pub(super) struct OpenedUpstream {
    protocol: UpstreamProtocol,
    io: BoxedAsyncReadWrite,
}

impl OpenedUpstream {
    pub(super) fn new(protocol: UpstreamProtocol, io: BoxedAsyncReadWrite) -> Self {
        Self { protocol, io }
    }
}

pub(super) type OpenUpstream = Arc<
    dyn Fn(H2UpstreamKey) -> Pin<Box<dyn Future<Output = Result<OpenedUpstream>> + Send>>
        + Send
        + Sync,
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
