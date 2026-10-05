//! One connection = one lease session: authentication, dispatch, invalidation fan-out.

use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dfs_core::auth::Principal;
use dfs_core::{Caller, Fs, Mutation};
use dfs_proto::{ClientFrame, Errno, Invalidation, Kind, PROTOCOL_VERSION, ROOT, Request, Response, ServerFrame, frame};
use dfs_store::Store;
use parking_lot::Mutex;
use tokio::io::{AsyncWriteExt, BufReader, BufWriter};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot};

use crate::registry::{Holdable, Registry};

pub const LEASE: Duration = Duration::from_secs(30);
const READ_ATTEMPTS: usize = 3;

pub struct Server<S: Store> {
    pub fs: Fs<S>,
    pub registry: Registry,
    pub calls: Mutex<HashMap<&'static str, (u64, u128)>>,
}

struct Lease {
    until: Instant,
    next: u64,
    pending: HashMap<u64, (Instant, oneshot::Sender<()>)>,
    released: bool,
}

pub struct Session {
    pub id: u128,
    pub principal: Principal,
    out: mpsc::UnboundedSender<ServerFrame>,
    lease: Mutex<Lease>,
}

impl Session {
    /// @cc [owner:fontanierh,label:concurrency] invalidation-acknowledged
    /// Returns only once the session acknowledged `items`, was released, or its lease (as extended
    /// by renewals observed while waiting) expired. Callers MUST NOT hold any lock across it.
    async fn invalidate(&self, items: Vec<Invalidation>) {
        let (number, mut acked) = {
            let mut lease = self.lease.lock();
            if lease.released {
                return;
            }
            let number = lease.next;
            lease.next += 1;
            let (tx, rx) = oneshot::channel();
            lease.pending.insert(number, (Instant::now(), tx));
            // A closed connection is released by its reader; the wait below then ends.
            let _ = self.out.send(ServerFrame::Invalidate { invalidation: number, items });
            (number, rx)
        };
        loop {
            let deadline = self.lease.lock().until;
            tokio::select! {
                _ = &mut acked => return,
                _ = tokio::time::sleep_until(deadline.into()) => {
                    if self.lease.lock().until <= deadline {
                        break;
                    }
                }
            }
        }
        self.lease.lock().pending.remove(&number);
    }

    fn ack(&self, number: u64) {
        if let Some((_, tx)) = self.lease.lock().pending.remove(&number) {
            let _ = tx.send(());
        }
    }

    /// Refused while an invalidation has been pending for more than half a lease.
    fn renew(&self) -> Result<Response, Errno> {
        let mut lease = self.lease.lock();
        if lease.released || lease.pending.values().any(|(sent, _)| sent.elapsed() > LEASE / 2) {
            return Err(Errno::EAGAIN);
        }
        lease.until = Instant::now() + LEASE;
        Ok(Response::Renewed { lease_ms: LEASE.as_millis() as u64 })
    }

    /// Ends every wait on this session immediately.
    fn release(&self) {
        let mut lease = self.lease.lock();
        lease.released = true;
        lease.until = Instant::now();
        lease.pending.clear();
    }
}

type Outcome = (Result<Response, Errno>, Vec<Invalidation>, bool);

fn failed(errno: Errno) -> Outcome {
    (Err(errno), Vec::new(), false)
}

fn name(request: &Request) -> &'static str {
    match request {
        Request::Hello { .. } => "hello",
        Request::Renew => "renew",
        Request::Close => "close",
        Request::Lookup { .. } => "lookup",
        Request::GetAttr { .. } => "getattr",
        Request::ReadDir { .. } => "readdir",
        Request::Read { .. } => "read",
        Request::ReadFiles { .. } => "read_files",
        Request::ReadLink { .. } => "readlink",
        Request::Create { .. } => "create",
        Request::Flush { .. } => "flush",
        Request::SetAttr { .. } => "setattr",
        Request::Remove { .. } => "remove",
        Request::Rename { .. } => "rename",
        Request::Grant { .. } => "grant",
        Request::SetBoundary { .. } => "set_boundary",
        Request::SetMembers { .. } => "set_members",
        Request::CreateToken { .. } => "create_token",
    }
}

impl<S: Store> Server<S> {
    pub fn new(fs: Fs<S>) -> Self {
        Self { fs, registry: Registry::default(), calls: Mutex::default() }
    }

    async fn read<T, F: Future<Output = Result<T, Errno>>>(
        &self,
        session: &Session,
        op: impl Fn() -> F,
        holds: impl Fn(&T) -> Vec<Holdable>,
        respond: impl Fn(T) -> Response,
    ) -> Outcome {
        for attempt in 1..=READ_ATTEMPTS {
            let start = self.registry.start();
            let value = match op().await {
                Ok(value) => value,
                Err(errno) => return failed(errno),
            };
            let fresh = self.registry.hold(session.id, &holds(&value), start);
            if fresh || attempt == READ_ATTEMPTS {
                return (Ok(respond(value)), Vec::new(), fresh);
            }
        }
        failed(Errno::EAGAIN)
    }

    async fn mutate(
        &self,
        session: &Session,
        op: impl Future<Output = Result<Mutation, Errno>>,
        holds: impl Fn(&Response) -> Vec<Holdable>,
    ) -> Outcome {
        let start = self.registry.start();
        let mutation = match op.await {
            Ok(mutation) => mutation,
            Err(errno) => return failed(errno),
        };
        let (fresh, fanout) = self.registry.mutate(session.id, &holds(&mutation.response), start, &mutation.invalidations);
        futures::future::join_all(fanout.into_iter().map(|(other, items)| async move { other.invalidate(items).await })).await;
        (Ok(mutation.response), mutation.invalidations, fresh)
    }

    /// @cc [owner:fontanierh,label:security] session-principal
    /// Every request MUST be evaluated as `session.principal`, the principal authenticated by
    /// `Hello`; no request field may name or override the acting principal.
    async fn dispatch(&self, session: &Session, seq: u64, request: Request) -> Outcome {
        let fs = &self.fs;
        let principal = &session.principal;
        let caller = Caller { principal: principal.clone(), session: session.id, seq, resent: false };
        let caller = &caller;
        let none = |_: &Response| Vec::new();
        match request {
            Request::Hello { .. } => failed(Errno::EINVAL),
            Request::Renew => (session.renew(), Vec::new(), false),
            Request::Close => {
                self.registry.remove(session.id);
                session.release();
                (Ok(Response::Done), Vec::new(), false)
            }
            Request::Lookup { parent, name } => {
                self.read(
                    session,
                    || fs.lookup(principal, parent, &name),
                    |attr| [Some(Holdable::Dir(parent)), attr.as_ref().map(|a| Holdable::Node(a.id))].into_iter().flatten().collect(),
                    Response::Entry,
                )
                .await
            }
            Request::GetAttr { id } => self.read(session, || fs.getattr(principal, id), |_| vec![Holdable::Node(id)], Response::Attr).await,
            Request::ReadDir { dir, after, limit } => {
                self.read(
                    session,
                    || fs.readdir(principal, dir, after.as_deref(), limit),
                    |listing| match listing {
                        Response::Listing { entries, .. } => {
                            let mut holds = vec![Holdable::Dir(dir), Holdable::Node(dir)];
                            holds.extend(entries.iter().map(|e| Holdable::Node(e.attr.id)));
                            holds
                        }
                        _ => Vec::new(),
                    },
                    |listing| listing,
                )
                .await
            }
            Request::Read { id, offset, len } => {
                let len = len.min(dfs_proto::MAX_IO_BYTES);
                self.read(session, || fs.read(principal, id, offset, len), |_| vec![Holdable::Node(id)], |data| data).await
            }
            // Contents are keyed by revision, so they need no holds: the mount trusts a revision only
            // through an attribute that a hold covers.
            Request::ReadFiles { ids, budget } => match fs.read_files(principal, &ids, budget).await {
                Ok(files) => (Ok(Response::Files(files)), Vec::new(), false),
                Err(errno) => failed(errno),
            },
            Request::ReadLink { id } => self.read(session, || fs.readlink(principal, id), |_| vec![Holdable::Node(id)], Response::Link).await,
            Request::Create { parent, name, kind, mode, exclusive, target } => {
                let created = |response: &Response| match response {
                    Response::Created { attr, .. } => {
                        let mut holds = vec![Holdable::Dir(parent), Holdable::Node(attr.id)];
                        if attr.kind == Kind::Dir {
                            holds.push(Holdable::Dir(attr.id));
                        }
                        holds
                    }
                    _ => Vec::new(),
                };
                self.mutate(session, fs.create(caller, parent, &name, kind, mode, exclusive, target.as_deref()), created).await
            }
            Request::Flush { id, writes, mtime_ns } => {
                self.mutate(session, fs.flush(caller, id, &writes, mtime_ns), |_| vec![Holdable::Node(id)]).await
            }
            Request::SetAttr { id, mode, size, mtime_ns } => {
                self.mutate(session, fs.setattr(caller, id, mode, size, mtime_ns), |_| vec![Holdable::Node(id)]).await
            }
            Request::Remove { parent, name, dir } => {
                self.mutate(session, fs.remove(caller, parent, &name, dir), |_| vec![Holdable::Dir(parent)]).await
            }
            Request::Rename { parent, name, new_parent, new_name, no_replace } => {
                let holds = |_: &Response| vec![Holdable::Dir(parent), Holdable::Dir(new_parent)];
                self.mutate(session, fs.rename(caller, parent, &name, new_parent, &new_name, no_replace), holds).await
            }
            Request::Grant { id, principal, right, granted } => {
                self.mutate(session, fs.grant(caller, id, &principal, right, granted), none).await
            }
            Request::SetBoundary { id, boundary } => self.mutate(session, fs.set_boundary(caller, id, boundary), none).await,
            Request::SetMembers { group, members } => self.mutate(session, fs.set_members(caller, &group, &members), none).await,
            Request::CreateToken { principal, admin } => self.mutate(session, fs.create_token(caller, &principal, admin), none).await,
        }
    }

    async fn hello(&self, request: Request, out: &mpsc::UnboundedSender<ServerFrame>) -> Result<(Arc<Session>, Response), Errno> {
        let Request::Hello { version, token, root } = request else { return Err(Errno::EINVAL) };
        if version != PROTOCOL_VERSION {
            return Err(Errno::EINVAL);
        }
        let principal = self.fs.authenticate(&token).await?;
        let id = self.fs.open_session(&principal).await?;
        let session = Arc::new(Session {
            id,
            principal,
            out: out.clone(),
            lease: Mutex::new(Lease { until: Instant::now() + LEASE, next: 1, pending: HashMap::new(), released: false }),
        });
        self.registry.add(session.clone());
        let root = match (session.principal.admin, root) {
            (true, None) => None,
            (_, root) => {
                let root = root.unwrap_or(ROOT);
                let start = self.registry.start();
                let attr = self.fs.getattr(&session.principal, root).await;
                let attr = attr.and_then(|a| if a.kind == Kind::Dir { Ok(a) } else { Err(Errno::ENOTDIR) });
                let attr = match attr {
                    Ok(attr) => attr,
                    Err(errno) => {
                        self.registry.remove(id);
                        return Err(errno);
                    }
                };
                self.registry.hold(id, &[Holdable::Node(root)], start);
                Some(attr)
            }
        };
        Ok((session, Response::Session { session: id, lease_ms: LEASE.as_millis() as u64, root }))
    }

    pub async fn serve(self: Arc<Self>, stream: TcpStream) -> anyhow::Result<()> {
        stream.set_nodelay(true)?;
        let (reader, writer) = stream.into_split();
        let (out, mut outgoing) = mpsc::unbounded_channel::<ServerFrame>();
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
        let mut reader = BufReader::new(reader);
        let ClientFrame::Call { id, request, .. } = frame::read(&mut reader).await? else {
            anyhow::bail!("expected Hello");
        };
        let session = match self.hello(request, &out).await {
            Ok((session, response)) => {
                let _ = out.send(ServerFrame::Reply { id, result: Ok(response), invalidations: Vec::new(), cacheable: true });
                session
            }
            Err(errno) => {
                let _ = out.send(ServerFrame::Reply { id, result: Err(errno), invalidations: Vec::new(), cacheable: false });
                return Ok(());
            }
        };
        while let Ok(frame) = frame::read::<_, ClientFrame>(&mut reader).await {
            match frame {
                ClientFrame::Ack { invalidation } => session.ack(invalidation),
                ClientFrame::Call { id, seq, request } => {
                    let server = self.clone();
                    let session = session.clone();
                    let out = out.clone();
                    tokio::spawn(async move {
                        let started = Instant::now();
                        let kind = name(&request);
                        let (result, invalidations, cacheable) = server.dispatch(&session, seq, request).await;
                        let elapsed = started.elapsed().as_micros();
                        {
                            let mut calls = server.calls.lock();
                            let entry = calls.entry(kind).or_default();
                            entry.0 += 1;
                            entry.1 += elapsed;
                        }
                        let _ = out.send(ServerFrame::Reply { id, result, invalidations, cacheable });
                    });
                }
            }
        }
        // A lost connection does not prove the mount purged its kernel caches (it may be paused), so
        // its holds stand until the lease, which can no longer be renewed, expires. `Close` is the
        // only early release.
        let until = session.lease.lock().until;
        tokio::time::sleep_until(until.into()).await;
        self.registry.remove(session.id);
        session.release();
        Ok(())
    }
}
