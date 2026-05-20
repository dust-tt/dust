// Pass-through wireup for the request rewriter. The full HTTP/1.1 parser,
// placeholder substitution, host/SNI checks, and websocket upgrade handling
// land in a follow-up PR that replaces these stubs. The module exists now so
// `forward/mod.rs` can wire the split-stream + spawn structure end-to-end and
// the deny log can grow its JSON shape independently of the rewriter logic.

use std::io::ErrorKind;

use anyhow::Result;
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot};

use crate::egress_secrets::SecretTable;

use super::deny_log::DenyLogEntry;

// Mode plumbing for the follow-up rewriter. The stub forwards bytes blindly
// and so does not read the inner fields, but the public shape is fixed now so
// the call sites in `mod.rs` do not have to change later.
#[allow(dead_code)]
#[derive(Clone, Copy, Debug)]
pub(super) enum HttpRewriteMode<'a> {
    Tls { sni: &'a str },
    PlainHttp { domain: &'a str },
}

#[derive(Debug)]
pub(super) enum HttpRewriteError {
    #[allow(dead_code)]
    Denied(DenyLogEntry),
    Io(anyhow::Error),
}

#[allow(dead_code)]
pub(super) struct WebSocketUpgradeWatch {
    pub accepted_tx: oneshot::Sender<bool>,
}

pub(super) async fn forward_http1_requests<R, W>(
    client_read: &mut R,
    upstream_write: &mut W,
    _secret_table: &SecretTable,
    _mode: HttpRewriteMode<'_>,
    _websocket_watch_tx: Option<&mpsc::Sender<WebSocketUpgradeWatch>>,
) -> Result<(), HttpRewriteError>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    tokio::io::copy(client_read, upstream_write)
        .await
        .map_err(|error| HttpRewriteError::Io(error.into()))?;
    // After the client closes, propagate the shutdown upstream so the upstream
    // side gets EOF and can close its half, matching `copy_bidirectional`.
    match upstream_write.shutdown().await {
        Ok(()) => Ok(()),
        Err(error)
            if matches!(
                error.kind(),
                ErrorKind::BrokenPipe | ErrorKind::ConnectionReset | ErrorKind::UnexpectedEof,
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(HttpRewriteError::Io(error.into())),
    }
}

pub(super) async fn copy_responses_with_websocket_watch<R, W>(
    upstream_read: &mut R,
    client_write: &mut W,
    _websocket_watch_rx: mpsc::Receiver<WebSocketUpgradeWatch>,
) -> Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    tokio::io::copy(upstream_read, client_write).await?;
    Ok(())
}
