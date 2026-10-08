use super::*;
use std::time::Instant;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Phase {
    Clean,
    Dirty,
    Publishing,
    Conflicted,
    Revoked,
    OutcomeUnknown,
}

struct Writer {
    ino: u64,
    node: Node,
    incarnation: Id,
    lease: WriterLease,
    phase: Phase,
    sequence: u64,
    published: u64,
    error: Option<i32>,
    renew_at: Instant,
    renewing: bool,
}

impl Writer {
    fn new(ino: u64, node: Node, incarnation: Id, lease: WriterLease) -> Self {
        let renew_at = Self::renew_at(&lease);
        Self {
            ino,
            node,
            incarnation,
            lease,
            phase: Phase::Clean,
            sequence: 0,
            published: 0,
            error: None,
            renew_at,
            renewing: false,
        }
    }

    fn renew_at(lease: &WriterLease) -> Instant {
        Instant::now()
            + Duration::from_millis((lease.expires_ms.saturating_sub(now_ms()) / 3).max(1))
    }

    fn fail(&mut self, code: i32) {
        if self.error.is_none() {
            self.error = Some(code);
            self.phase = match code {
                libc::EACCES | libc::ESTALE => Phase::Revoked,
                libc::EIO | libc::ETIMEDOUT => Phase::OutcomeUnknown,
                _ => Phase::Conflicted,
            };
            tracing::warn!(node = %self.node.id, code, phase = ?self.phase, sequence = self.sequence, published = self.published, "writeback inode stopped");
        }
    }
}

#[derive(Default)]
pub(super) struct Writers {
    entries: HashMap<Id, Writer>,
}

struct Renewal {
    node: Id,
    remote: Id,
    generation: Id,
    incarnation: Id,
    client: Client,
}

impl Mount {
    pub(super) fn has_writer(&self, node: &str) -> bool {
        self.writers.entries.contains_key(node)
    }

    pub(super) fn writer_error(&self, node: &str) -> Result<()> {
        if let Some(writer) = self.writers.entries.get(node) {
            if let Some(code) = writer.error {
                return Err(err(code, "writeback failed; fresh mount required"));
            }
            if writer.incarnation != self.client.read().session.incarnation
                || !self.inodes.is_active(writer.ino, node)
            {
                return Err(err(libc::ESTALE, "retired writeback generation"));
            }
        }
        Ok(())
    }

    pub(super) fn open_writer(&mut self, ino: u64, node: &Node) -> Result<WritebackHandle> {
        self.writer_error(&node.id)?;
        if !self.writers.entries.contains_key(&node.id)
            && self.writers.entries.len() >= self.writeback_capacity
        {
            return Err(err(libc::EMFILE, "writeback inode capacity"));
        }
        let Reply::WritebackHandle(opened) = self.call(Call::OpenWriteback {
            node: node.id.clone(),
            request: uuid::Uuid::new_v4().to_string(),
        })?
        else {
            return Err(err(libc::EIO, "writeback open reply"));
        };
        if opened.node.version != node.version || opened.node.size != node.size {
            self.fail_writeback(&node.id, libc::ESTALE);
            let _ = self.call(Call::Close {
                handle: opened.handle,
            });
            return Err(err(libc::ESTALE, "writeback inode awaits reconciliation"));
        }
        if let Some(writer) = self.writers.entries.get_mut(&node.id) {
            if writer.lease.generation != opened.lease.generation
                || writer.node.version != opened.node.version
            {
                writer.fail(libc::ESTALE);
                let _ = self.call(Call::Close {
                    handle: opened.handle,
                });
                return Err(err(libc::ESTALE, "writeback ownership changed"));
            }
        } else {
            self.writers.entries.insert(
                node.id.clone(),
                Writer::new(
                    ino,
                    opened.node.clone(),
                    self.client.read().session.incarnation.clone(),
                    opened.lease.clone(),
                ),
            );
        }
        self.writers.entries.get_mut(&node.id).unwrap().phase = Phase::Dirty;
        self.writer_metrics();
        Ok(opened)
    }

    pub(super) fn shared_writer(&self, handle: &mut OpenFile) {
        if handle.fenced
            && let Some(writer) = self.writers.entries.get(&handle.node.id)
        {
            handle.node = writer.node.clone();
            handle.base = writer.node.version.clone();
            handle.error = writer.error.or(handle.error);
        }
    }

    pub(super) fn begin_writeback(&mut self, node: &str) -> Result<()> {
        self.writer_error(node)?;
        if let Some(writer) = self.writers.entries.get_mut(node) {
            writer.sequence = writer
                .sequence
                .checked_add(1)
                .ok_or_else(|| err(libc::EOVERFLOW, "writeback sequence exhausted"))?;
            writer.phase = Phase::Publishing;
            self.operations
                .writeback_batches
                .fetch_add(1, Ordering::Relaxed);
        }
        Ok(())
    }

    pub(super) fn validate_writer(&mut self, node: &str) -> Result<()> {
        self.writer_error(node)?;
        let Some(writer) = self.writers.entries.get(node) else {
            return Ok(());
        };
        let generation = writer.lease.generation.clone();
        let remote = self
            .handles
            .values()
            .find(|handle| handle.fenced && handle.node.id == node)
            .and_then(|handle| handle.remote.clone())
            .ok_or_else(|| err(libc::ESTALE, "writeback handle absent"))?;
        let result = self.call(Call::RenewWriteback { handle: remote });
        let writer = self.writers.entries.get_mut(node).unwrap();
        match result {
            Ok(Reply::WriterLease(lease)) if lease.generation == generation => {
                writer.renew_at = Writer::renew_at(&lease);
                writer.lease = lease;
            }
            result => {
                let code = result.err().map_or(libc::ESTALE, |error| error.code);
                writer.fail(code);
                writer.phase = Phase::Revoked;
            }
        }
        self.writer_metrics();
        self.writer_error(node)
    }

    pub(super) fn published_writeback(&mut self, node: &Node) {
        if let Some(writer) = self.writers.entries.get_mut(&node.id) {
            writer.node = node.clone();
            writer.published = writer.sequence;
            self.operations
                .writeback_published_batches
                .fetch_add(1, Ordering::Relaxed);
            writer.phase = Phase::Dirty;
        }
    }

    pub(super) fn fail_writeback(&mut self, node: &str, code: i32) {
        if let Some(writer) = self.writers.entries.get_mut(node) {
            writer.fail(code);
        }
        self.writer_metrics();
    }

    fn writer_metrics(&self) {
        self.operations
            .writeback_inodes
            .store(self.writers.entries.len() as u64, Ordering::Relaxed);
        self.operations.writeback_failed_inodes.store(
            self.writers
                .entries
                .values()
                .filter(|writer| writer.error.is_some())
                .count() as u64,
            Ordering::Relaxed,
        );
    }

    pub(super) fn fail_writeback_handle(&mut self, fh: u64, code: i32) {
        if let Some(node) = self
            .handles
            .get(&fh)
            .filter(|handle| handle.fenced)
            .map(|handle| handle.node.id.clone())
        {
            self.fail_writeback(&node, code);
        }
    }

    pub(super) fn release_writer(&mut self, node: &str) {
        if !self
            .handles
            .values()
            .any(|handle| handle.fenced && handle.node.id == node)
            && self
                .writers
                .entries
                .get(node)
                .is_some_and(|writer| writer.error.is_none())
        {
            self.writers.entries.remove(node);
        }
        self.writer_metrics();
    }

    fn renewals(&mut self) -> Vec<Renewal> {
        let client = self.client();
        let mut renewals = Vec::new();
        for (node, writer) in &mut self.writers.entries {
            if writer.error.is_some() || writer.renewing || writer.renew_at > Instant::now() {
                continue;
            }
            if writer.incarnation != client.session.incarnation {
                writer.fail(libc::ESTALE);
                continue;
            }
            if let Some(remote) = self
                .handles
                .values()
                .find(|handle| handle.fenced && handle.node.id == *node)
                .and_then(|handle| handle.remote.clone())
            {
                writer.renewing = true;
                renewals.push(Renewal {
                    node: node.clone(),
                    remote,
                    generation: writer.lease.generation.clone(),
                    incarnation: writer.incarnation.clone(),
                    client: client.clone(),
                });
            }
        }
        self.writer_metrics();
        renewals
    }

    fn renewed(&mut self, renewal: Renewal, result: Result<Reply>) {
        let Some(writer) = self.writers.entries.get_mut(&renewal.node) else {
            return;
        };
        if writer.lease.generation != renewal.generation
            || writer.incarnation != renewal.incarnation
        {
            return;
        }
        writer.renewing = false;
        if !self
            .handles
            .values()
            .any(|handle| handle.remote.as_ref() == Some(&renewal.remote))
        {
            return;
        }
        match result {
            Ok(Reply::WriterLease(lease)) if lease.generation == renewal.generation => {
                writer.renew_at = Writer::renew_at(&lease);
                writer.lease = lease;
            }
            Ok(_) => {
                if writer.error.is_none() {
                    writer.fail(libc::EIO);
                    writer.phase = Phase::Revoked;
                }
            }
            Err(error) => {
                if writer.error.is_none() {
                    writer.fail(error.code);
                    writer.phase = Phase::Revoked;
                }
            }
        }
        self.writer_metrics();
    }

    pub(super) fn start_writer_renewal(state: &Arc<Mutex<Self>>, runtime: &tokio::runtime::Handle) {
        let state = Arc::downgrade(state);
        runtime.spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(100));
            loop {
                interval.tick().await;
                let Some(mount) = state.upgrade() else {
                    break;
                };
                let renewals =
                    match tokio::task::spawn_blocking(move || mount.lock().renewals()).await {
                        Ok(renewals) => renewals,
                        Err(_) => break,
                    };
                for renewal in renewals {
                    let state = state.clone();
                    tokio::spawn(async move {
                        let result = renewal
                            .client
                            .call(Call::RenewWriteback {
                                handle: renewal.remote.clone(),
                            })
                            .await;
                        if let Some(mount) = state.upgrade() {
                            let _ = tokio::task::spawn_blocking(move || {
                                mount.lock().renewed(renewal, result)
                            })
                            .await;
                        }
                    });
                }
            }
        });
    }
}

pub(super) async fn read_fill(
    state: std::sync::Weak<Mutex<Mount>>,
    reader: Arc<Reader>,
    mut request: ReadRequest,
    fh: u64,
    mut reply: ReplyData,
    _permit: tokio::sync::OwnedSemaphorePermit,
    _pin: InodePin,
) {
    for attempt in 0..8 {
        let result = reader.read(request.clone()).await;
        let state = state.clone();
        let reader = reader.clone();
        let completion = tokio::task::spawn_blocking(move || {
            let Some(state) = state.upgrade() else {
                reply.error(libc::EIO);
                return None;
            };
            let mount = state.lock();
            let _guard = mount.gate.lock();
            let result = result.and_then(|bytes| {
                mount.writer_error(&request.node.id)?;
                reader.validate(&request)?;
                Ok(bytes)
            });
            match result {
                Ok(bytes) => {
                    reply.data(&bytes);
                    None
                }
                Err(error) => {
                    let cache = mount.cache.lock();
                    let refreshed = mount.handle(fh).ok().filter(|handle| {
                        handle.fenced
                            && handle.error.is_none()
                            && handle.node.version != request.node.version
                            && handle.incarnation == request.incarnation
                            && cache.namespace.incarnation == request.incarnation
                            && cache.namespace.auth_generation == request.auth_generation
                            && cache
                                .namespace
                                .nodes
                                .get(&request.node.id)
                                .is_some_and(|item| {
                                    item.verbs & READ != 0
                                        && item.node.version == handle.node.version
                                })
                    });
                    if error.code == libc::ESTALE
                        && attempt < 7
                        && !request.unlinked
                        && let Some(handle) = refreshed
                    {
                        request.node = handle.node;
                        mount
                            .operations
                            .writeback_read_retries
                            .fetch_add(1, Ordering::Relaxed);
                        Some((reply, request))
                    } else {
                        tracing::debug!(?error, fh, "writeback page fill failed");
                        reply.error(error.code);
                        None
                    }
                }
            }
        })
        .await;
        match completion {
            Ok(Some((next_reply, next_request))) => {
                reply = next_reply;
                request = next_request;
            }
            _ => return,
        }
    }
}
