//! Multiplexed client: any number of concurrent calls over one connection; invalidations are
//! delivered on a channel and acknowledged explicitly once the caller has applied them.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncWriteExt, BufReader, BufWriter};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot};

use crate::{ClientFrame, Errno, Invalidation, Request, Response, ServerFrame, frame};

#[derive(Debug)]
pub struct Reply {
    pub result: Result<Response, Errno>,
    pub invalidations: Vec<Invalidation>,
    pub cacheable: bool,
}

/// One pushed invalidation; `Client::ack(id)` once applied.
pub type Pushed = (u64, Vec<Invalidation>);

type Pending = Arc<Mutex<Option<HashMap<u64, oneshot::Sender<Reply>>>>>;

pub struct Client {
    out: mpsc::UnboundedSender<ClientFrame>,
    pending: Pending,
    next_id: AtomicU64,
    next_seq: AtomicU64,
}

impl Client {
    /// Connects; pushed invalidations go to `pushed`. The channel closes when the connection ends.
    pub async fn connect(addr: &str, pushed: mpsc::UnboundedSender<Pushed>) -> std::io::Result<Client> {
        let stream = TcpStream::connect(addr).await?;
        stream.set_nodelay(true)?;
        let (reader, writer) = stream.into_split();
        let (out, mut outgoing) = mpsc::unbounded_channel::<ClientFrame>();
        let pending: Pending = Arc::new(Mutex::new(Some(HashMap::new())));
        tokio::spawn(async move {
            let mut writer = BufWriter::new(writer);
            while let Some(frame) = outgoing.recv().await {
                if frame::write(&mut writer, &frame).await.is_err() {
                    break;
                }
                if outgoing.is_empty() && writer.flush().await.is_err() {
                    break;
                }
            }
        });
        let replies = pending.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(reader);
            while let Ok(frame) = frame::read::<_, ServerFrame>(&mut reader).await {
                match frame {
                    ServerFrame::Reply { id, result, invalidations, cacheable } => {
                        let waiter = replies.lock().ok().and_then(|mut p| p.as_mut().and_then(|p| p.remove(&id)));
                        if let Some(waiter) = waiter {
                            let _ = waiter.send(Reply { result, invalidations, cacheable });
                        }
                    }
                    ServerFrame::Invalidate { invalidation, items } => {
                        let _ = pushed.send((invalidation, items));
                    }
                }
            }
            // Fail every in-flight and future call.
            if let Ok(mut pending) = replies.lock() {
                pending.take();
            }
        });
        Ok(Client { out, pending, next_id: AtomicU64::new(1), next_seq: AtomicU64::new(1) })
    }

    /// Sends one call and waits for its reply; a lost connection yields `EIO`.
    pub async fn call(&self, request: Request) -> Reply {
        let lost = || Reply { result: Err(Errno::EIO), invalidations: Vec::new(), cacheable: false };
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let seq = if request.is_mutation() { self.next_seq.fetch_add(1, Ordering::Relaxed) } else { 0 };
        let (tx, rx) = oneshot::channel();
        {
            let Ok(mut pending) = self.pending.lock() else { return lost() };
            let Some(pending) = pending.as_mut() else { return lost() };
            pending.insert(id, tx);
        }
        if self.out.send(ClientFrame::Call { id, seq, request }).is_err() {
            return lost();
        }
        rx.await.unwrap_or_else(|_| lost())
    }

    pub fn ack(&self, invalidation: u64) {
        let _ = self.out.send(ClientFrame::Ack { invalidation });
    }

    pub fn is_connected(&self) -> bool {
        self.pending.lock().is_ok_and(|p| p.is_some())
    }
}
