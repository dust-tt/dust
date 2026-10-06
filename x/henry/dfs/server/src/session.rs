//! One connection = one session: authentication and dispatch. The server keeps no per-session
//! cache state: mounts bound the age of what they serve themselves.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use dfs_core::auth::Principal;
use dfs_core::{Caller, Fs};
use dfs_proto::{ClientFrame, Errno, Kind, PROTOCOL_VERSION, ROOT, Request, Response, ServerFrame, frame};
use dfs_store::Store;
use parking_lot::Mutex;
use tokio::io::{AsyncWriteExt, BufReader, BufWriter};
use tokio::net::TcpStream;
use tokio::sync::mpsc;

pub struct Server<S: Store> {
    pub fs: Fs<S>,
    pub calls: Mutex<HashMap<&'static str, (u64, u128)>>,
}

pub struct Session {
    pub id: u128,
    pub principal: Principal,
}

fn name(request: &Request) -> &'static str {
    match request {
        Request::Hello { .. } => "hello",
        Request::Close => "close",
        Request::Lookup { .. } => "lookup",
        Request::GetAttr { .. } => "getattr",
        Request::ReadDir { .. } => "readdir",
        Request::Validate { .. } => "validate",
        Request::Read { .. } => "read",
        Request::ReadFiles { .. } => "read_files",
        Request::ReadLink { .. } => "readlink",
        Request::AllocIds => "alloc_ids",
        Request::Apply { .. } => "apply",
        Request::Grant { .. } => "grant",
        Request::SetBoundary { .. } => "set_boundary",
        Request::SetMembers { .. } => "set_members",
        Request::CreateToken { .. } => "create_token",
    }
}

/// A read's reply with the version it was served at.
fn read<T>(result: Result<(T, u64), Errno>, respond: impl FnOnce(T) -> Response) -> (Result<Response, Errno>, u64) {
    match result {
        Ok((value, version)) => (Ok(respond(value)), version),
        Err(errno) => (Err(errno), 0),
    }
}

impl<S: Store> Server<S> {
    pub fn new(fs: Fs<S>) -> Self {
        Self { fs, calls: Mutex::default() }
    }

    /// @cc [owner:fontanierh,label:security] session-principal
    /// Every request MUST be evaluated as `session.principal`, the principal authenticated by
    /// `Hello`; no request field may name or override the acting principal.
    async fn dispatch(&self, session: &Session, seq: u64, request: Request) -> (Result<Response, Errno>, u64) {
        let fs = &self.fs;
        let principal = &session.principal;
        let caller = &Caller { principal: principal.clone(), session: session.id, seq, resent: false };
        let done = |result: Result<Response, Errno>| (result, 0);
        match request {
            Request::Hello { .. } => done(Err(Errno::EINVAL)),
            Request::Close => done(Ok(Response::Done)),
            Request::Lookup { parent, name } => read(fs.lookup(principal, parent, &name).await, Response::Entry),
            Request::GetAttr { id } => read(fs.getattr(principal, id).await, Response::Attr),
            Request::ReadDir { dir, after, limit, at } => read(fs.readdir(principal, dir, after.as_deref(), limit, at).await, |listing| listing),
            Request::Validate { dirs } => read(fs.validate(principal, &dirs).await, Response::Valid),
            Request::Read { id, offset, len } => read(fs.read(principal, id, offset, len).await, |data| data),
            Request::ReadFiles { ids, budget } => read(fs.read_files(principal, &ids, budget).await, Response::Files),
            Request::ReadLink { id } => read(fs.readlink(principal, id).await, Response::Link),
            Request::AllocIds => done(fs.alloc_ids(principal).await.map(|(first, count)| Response::Ids { first, count })),
            Request::Apply { ops } => done(fs.apply(caller, &ops).await),
            Request::Grant { id, principal, right, granted } => done(fs.grant(caller, id, &principal, right, granted).await),
            Request::SetBoundary { id, boundary } => done(fs.set_boundary(caller, id, boundary).await),
            Request::SetMembers { group, members } => done(fs.set_members(caller, &group, &members).await),
            Request::CreateToken { principal, admin } => done(fs.create_token(caller, &principal, admin).await),
        }
    }

    async fn hello(&self, request: Request) -> Result<(Session, Response), Errno> {
        let Request::Hello { version, token, root } = request else { return Err(Errno::EINVAL) };
        if version != PROTOCOL_VERSION {
            return Err(Errno::EINVAL);
        }
        let principal = self.fs.authenticate(&token).await?;
        let id = self.fs.open_session(&principal).await?;
        let root = match (principal.admin, root) {
            (true, None) => None,
            (_, root) => {
                let (attr, _) = self.fs.getattr(&principal, root.unwrap_or(ROOT)).await?;
                if attr.kind != Kind::Dir {
                    return Err(Errno::ENOTDIR);
                }
                Some(attr)
            }
        };
        Ok((Session { id, principal }, Response::Session { session: id, root }))
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
        let ClientFrame::Call { id, request, .. } = frame::read(&mut reader).await?;
        let session = match self.hello(request).await {
            Ok((session, response)) => {
                let _ = out.send(ServerFrame::Reply { id, result: Ok(response), version: 0 });
                Arc::new(session)
            }
            Err(errno) => {
                let _ = out.send(ServerFrame::Reply { id, result: Err(errno), version: 0 });
                return Ok(());
            }
        };
        while let Ok(ClientFrame::Call { id, seq, request }) = frame::read::<_, ClientFrame>(&mut reader).await {
            let server = self.clone();
            let session = session.clone();
            let out = out.clone();
            tokio::spawn(async move {
                let started = Instant::now();
                let kind = name(&request);
                let (result, version) = server.dispatch(&session, seq, request).await;
                let elapsed = started.elapsed().as_micros();
                {
                    let mut calls = server.calls.lock();
                    let entry = calls.entry(kind).or_default();
                    entry.0 += 1;
                    entry.1 += elapsed;
                }
                let _ = out.send(ServerFrame::Reply { id, result, version });
            });
        }
        Ok(())
    }
}
