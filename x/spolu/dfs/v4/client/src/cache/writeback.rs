use super::*;
use memory::object_weight;
use std::collections::{BTreeMap, BTreeSet};
use tokio::sync::{OwnedSemaphorePermit, watch};
mod refresh;

const MAX_GROUP_COST: usize = 900_000;
const MAX_WRITE: usize = 256 * 1024;
pub(super) const MAX_GROUPS: usize = 4096;

struct Charge {
    _memory: OwnedSemaphorePermit,
    _dirty: OwnedSemaphorePermit,
}
#[derive(Clone)]
struct Operation {
    rpc: Edit,
    _charges: Vec<Arc<Charge>>,
}
struct Receipt {
    id: u64,
    result: watch::Sender<Option<std::result::Result<(), ErrorCode>>>,
}
impl Receipt {
    fn new(id: u64) -> Arc<Self> {
        Arc::new(Self {
            id,
            result: watch::channel(None).0,
        })
    }
    async fn wait(&self) -> Result<()> {
        let mut receiver = self.result.subscribe();
        loop {
            if let Some(result) = *receiver.borrow_and_update() {
                return result.map_err(status);
            }
            receiver
                .changed()
                .await
                .map_err(|_| status(ErrorCode::Unavailable))?;
        }
    }
}
struct Group {
    id: u64,
    target: String,
    participants: Vec<String>,
    operations: Vec<Arc<Operation>>,
    dependencies: Vec<Arc<Receipt>>,
    receipt: Arc<Receipt>,
    ready: Instant,
    forced: bool,
    inflight: bool,
    dispatched: Option<Instant>,
    cost: usize,
    bytes: usize,
    bindings: Vec<(String, String, Option<String>)>,
    deleted: Vec<String>,
    _pins: Vec<Arc<Gate>>,
    _charge: Arc<Charge>,
    _slot: OwnedSemaphorePermit,
}
struct Dirty {
    base: Option<Object>,
    current: Option<Object>,
    expires: Instant,
    pending: BTreeSet<u64>,
    primary: BTreeSet<u64>,
    own_tail: Option<Arc<Receipt>>,
    _charge: Arc<Charge>,
    _refresh_memory: Option<OwnedSemaphorePermit>,
}
#[derive(Default)]
pub(super) struct Pending {
    groups: BTreeMap<u64, Group>,
    objects: HashMap<String, Dirty>,
    names: HashMap<String, BTreeMap<String, BTreeMap<u64, Option<String>>>>,
    errors: HashMap<String, ErrorCode>,
    sync_errors: HashMap<String, ErrorCode>,
    next: u64,
    retired: std::collections::VecDeque<String>,
}
impl Pending {
    pub fn names(&self, parent: &str) -> impl Iterator<Item = &str> {
        self.names
            .get(parent)
            .into_iter()
            .flat_map(|names| names.keys().map(String::as_str))
    }
    pub fn local_directory(&self, id: &str) -> bool {
        self.objects.get(id).is_some_and(|node| {
            node.base.is_none() && node.current.as_ref().is_some_and(|o| o.directory)
        })
    }
    pub fn overlay_page(&self, request: &ListRequest, mut page: Page) -> Page {
        if request.directory_id == "shared" {
            return page;
        }
        let Some(names) = self.names.get(&request.directory_id) else {
            for entry in &mut page.entries {
                if let Some(object) = &entry.object
                    && let Some(Ok(current)) = self.object(&object.id)
                {
                    entry.object = Some(current);
                }
            }
            return page;
        };
        let boundary = page.next_after.clone();
        let mut entries: BTreeMap<_, _> = page
            .entries
            .into_iter()
            .map(|e| (e.name.clone(), e))
            .collect();
        let mut more = false;
        for (name, versions) in names {
            if request.after.as_ref().is_some_and(|after| name <= after)
                || boundary.as_ref().is_some_and(|end| name > end)
            {
                continue;
            }
            match versions.last_key_value().and_then(|(_, id)| id.as_ref()) {
                Some(id) => {
                    if let Some(Ok(object)) = self.object(id) {
                        entries.insert(
                            name.clone(),
                            Entry {
                                name: name.clone(),
                                object: Some(object),
                            },
                        );
                    }
                }
                None => {
                    entries.remove(name);
                }
            }
            if entries.len() > request.limit as usize {
                entries.pop_last();
                more = true;
            }
        }
        let mut bytes = 0;
        let mut output = Vec::new();
        for (_, mut entry) in entries {
            if let Some(object) = &entry.object
                && let Some(Ok(current)) = self.object(&object.id)
            {
                entry.object = Some(current);
            }
            bytes += entry.object.as_ref().map_or(0, object_weight) + entry.name.len();
            if bytes > MAX_IO && !output.is_empty() {
                more = true;
                break;
            }
            output.push(entry);
        }
        Page {
            next_after: if more {
                output.last().map(|e| e.name.clone())
            } else {
                boundary
            },
            entries: output,
        }
    }
    pub fn object(&self, id: &str) -> Option<Result<Object>> {
        if let Some(error) = self.errors.get(id) {
            return Some(Err(status(*error)));
        }
        let object = self.objects.get(id)?;
        if Instant::now() >= object.expires || self.errors.contains_key(id) {
            return None;
        }
        Some(
            object
                .current
                .clone()
                .ok_or_else(|| status(ErrorCode::NotFound)),
        )
    }
    pub fn contains(&self, id: &str) -> bool {
        self.objects.get(id).is_some_and(|n| !n.pending.is_empty())
    }
    pub fn binding(&self, parent: &str, name: &str) -> Option<Option<String>> {
        self.names
            .get(parent)?
            .get(name)?
            .last_key_value()
            .map(|(_, id)| id.clone())
    }
    fn force(&mut self, id: &str) -> Vec<Arc<Receipt>> {
        let receipts: Vec<_> = self
            .objects
            .get(id)
            .into_iter()
            .flat_map(|n| &n.pending)
            .filter_map(|id| self.groups.get(id).map(|g| g.receipt.clone()))
            .collect();
        let mut stack = receipts.clone();
        let mut seen = BTreeSet::new();
        while let Some(receipt) = stack.pop() {
            if !seen.insert(receipt.id) {
                continue;
            }
            if let Some(group) = self.groups.get_mut(&receipt.id) {
                group.forced = true;
                stack.extend(group.dependencies.iter().cloned());
            }
        }
        receipts
    }
}

impl CachedClient {
    pub fn create(&self, r: CreateRequest) -> Result<Mutation> {
        self.raw.runtime.block_on(self.inner.create(r))
    }
    pub fn update(&self, r: UpdateRequest) -> Result<Mutation> {
        self.raw.runtime.block_on(self.inner.update(r))
    }
    pub fn write(&self, r: WriteRequest) -> Result<Mutation> {
        self.raw.runtime.block_on(self.inner.write(r))
    }
    pub fn remove_at(&self, parent: String, name: String, r: RemoveRequest) -> Result<Mutation> {
        self.raw
            .runtime
            .block_on(self.inner.remove(parent, name, r))
    }
    pub fn rename_from(&self, parent: String, name: String, r: RenameRequest) -> Result<Mutation> {
        self.raw
            .runtime
            .block_on(self.inner.rename(parent, name, r))
    }
    /// @cc [owner:spolu,label:concurrency] finite-object-barrier
    /// Fsync MUST wait only the captured target prefix and its prerequisites. It MUST NOT perform
    /// a subsequent cache refresh that could flush edits accepted after the barrier.
    pub fn fsync(&self, r: ObjectRequest) -> Result<()> {
        self.raw.runtime.block_on(self.inner.flush(&r.object_id))
    }
    pub fn drain(&self) -> Result<()> {
        self.raw.runtime.block_on(async {
            let receipts = {
                let mut pending = self.inner.pending.lock();
                pending
                    .groups
                    .values_mut()
                    .map(|g| {
                        g.forced = true;
                        g.receipt.clone()
                    })
                    .collect::<Vec<_>>()
            };
            self.inner.changed.notify_one();
            let mut failure = None;
            for receipt in receipts {
                if let Err(error) = receipt.wait().await {
                    failure = Some(error);
                }
            }
            if let Some(error) = failure {
                return Err(error);
            }
            if let Some(error) = self.inner.pending.lock().errors.values().next() {
                return Err(status(*error));
            }
            Ok(())
        })
    }
    pub fn check_error(&self, id: &str) -> Result<()> {
        self.inner.check_error(id)
    }
}
impl Inner {
    pub(super) async fn read_overlay(
        &self,
        object: &Object,
        offset: u64,
        length: u32,
    ) -> Result<Vec<u8>> {
        let snapshot = {
            let pending = self.pending.lock();
            pending.objects.get(&object.id).map(|node| {
                let edits = node
                    .pending
                    .iter()
                    .filter_map(|id| pending.groups.get(id))
                    .flat_map(|g| g.operations.iter().cloned())
                    .collect::<Vec<_>>();
                (node.base.clone(), edits)
            })
        };
        let Some((base, edits)) = snapshot else {
            return self.read_base(object, offset, length).await;
        };
        let wanted = (length as u64).min(object.size.saturating_sub(offset)) as usize;
        let mut data = match &base {
            Some(base) => self.read_base(base, offset, length).await?,
            None => vec![],
        };
        data.resize(wanted, 0);
        let end = offset + wanted as u64;
        let mut size = base.as_ref().map_or(0, |o| o.size);
        for edit in edits {
            match &edit.rpc.operation {
                Some(edit::Operation::Write(r)) if r.object_id == object.id => {
                    let start = if r.append { size } else { r.offset };
                    let write_end = start + r.data.len() as u64;
                    let from = start.max(offset);
                    let to = write_end.min(end);
                    if from < to {
                        data[(from - offset) as usize..(to - offset) as usize].copy_from_slice(
                            &r.data[(from - start) as usize..(to - start) as usize],
                        );
                    }
                    size = size.max(write_end);
                }
                Some(edit::Operation::Update(r)) if r.object_id == object.id => {
                    if let Some(new_size) = r.size {
                        if new_size < size {
                            let from = new_size.max(offset);
                            let to = size.min(end);
                            if from < to {
                                data[(from - offset) as usize..(to - offset) as usize].fill(0);
                            }
                        }
                        size = new_size;
                    }
                }
                _ => (),
            }
        }
        Ok(data)
    }
    pub(super) fn start(inner: &Arc<Self>) {
        let weak = Arc::downgrade(inner);
        tokio::spawn(async move {
            loop {
                let Some(inner) = weak.upgrade() else {
                    return;
                };
                inner.dispatch();
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_millis(2)) => (),
                    _ = inner.changed.notified() => (),
                }
            }
        });
    }
    fn check_error(&self, id: &str) -> Result<()> {
        self.active()?;
        match self.pending.lock().errors.get(id) {
            Some(e) => Err(status(*e)),
            None => Ok(()),
        }
    }
    pub(super) async fn flush(&self, id: &str) -> Result<()> {
        self.active()?;
        let receipts = self.pending.lock().force(id);
        self.changed.notify_one();
        for receipt in receipts {
            receipt.wait().await?;
        }
        self.check_error(id)?;
        match self.pending.lock().sync_errors.get(id) {
            Some(error) => Err(status(*error)),
            None => Ok(()),
        }
    }
    async fn reserve(&self, bytes: usize) -> Result<Arc<Charge>> {
        let bytes = u32::try_from(bytes).map_err(|_| status(ErrorCode::Capacity))?;
        if bytes as usize > self.config.dirty_mib * 1024 * 1024 {
            return Err(status(ErrorCode::Capacity));
        }
        let dirty_wait = self.rpc.measure("wait.dirty_budget");
        let dirty = self
            .dirty_budget
            .clone()
            .acquire_many_owned(bytes)
            .await
            .map_err(|_| status(ErrorCode::Unavailable))?;
        drop(dirty_wait);
        let memory_wait = self.rpc.measure("wait.memory_budget");
        let memory = self.cache.lock().reserve(bytes as usize);
        let memory = match memory {
            Some(permit) => permit,
            None => self
                .memory
                .clone()
                .acquire_many_owned(bytes)
                .await
                .map_err(|_| status(ErrorCode::Unavailable))?,
        };
        drop(memory_wait);
        Ok(Arc::new(Charge {
            _memory: memory,
            _dirty: dirty,
        }))
    }
    async fn create(self: &Arc<Self>, mut r: CreateRequest) -> Result<Mutation> {
        dfs_protocol::validate::name(&r.name)?;
        let parent = self.stat(&r.parent_id).await?;
        if !parent.directory {
            return Err(status(ErrorCode::NotDirectory));
        }
        match self
            .lookup(LookupRequest {
                parent_id: r.parent_id.clone(),
                name: r.name.clone(),
            })
            .await
        {
            Ok(_) => return Err(status(ErrorCode::AlreadyExists)),
            Err(e) if code(&e) == ErrorCode::NotFound => (),
            Err(e) => return Err(e),
        }
        r.object_id = uuid::Uuid::new_v4().simple().to_string();
        let mut object = new_object(&r)?;
        object.revision.clear();
        let bindings = vec![(
            r.parent_id.clone(),
            r.name.clone(),
            Some(r.object_id.clone()),
        )];
        let gate = self.gate(&parent.id)?;
        let gate_wait = self.rpc.measure("wait.object_gate");
        let _guard = gate.mutex.lock().await;
        drop(gate_wait);
        if self
            .pending
            .lock()
            .binding(&r.parent_id, &r.name)
            .flatten()
            .is_some()
            || self
                .cache
                .lock()
                .fresh(&Key::Name(r.parent_id.clone(), r.name.clone()))
                .is_some_and(|e| matches!(&e.value, Value::Name(Some(_))))
        {
            return Err(status(ErrorCode::AlreadyExists));
        }
        self.enqueue(
            Edit {
                operation: Some(edit::Operation::Create(r)),
            },
            object.id.clone(),
            vec![(parent.id.clone(), Some(parent)), (object.id.clone(), None)],
            bindings,
        )
        .await?;
        Ok(Mutation {
            object: Some(object),
            related: vec![],
        })
    }
    async fn update(self: &Arc<Self>, r: UpdateRequest) -> Result<Mutation> {
        let gate = self.gate(&r.object_id)?;
        let gate_wait = self.rpc.measure("wait.object_gate");
        let _guard = gate.mutex.lock().await;
        drop(gate_wait);
        let object = self.stat_locked(&r.object_id, &gate).await?;
        let mut projected = Some(object.clone());
        apply_metadata(
            &mut projected,
            &object.id,
            &Edit {
                operation: Some(edit::Operation::Update(r.clone())),
            },
        )?;
        self.enqueue(
            Edit {
                operation: Some(edit::Operation::Update(r)),
            },
            object.id.clone(),
            vec![(object.id.clone(), Some(object))],
            vec![],
        )
        .await
    }
    async fn write(self: &Arc<Self>, r: WriteRequest) -> Result<Mutation> {
        if r.data.len() > MAX_IO {
            return Err(status(ErrorCode::InvalidInput));
        }
        let gate = self.gate(&r.object_id)?;
        let gate_wait = self.rpc.measure("wait.object_gate");
        let _guard = gate.mutex.lock().await;
        drop(gate_wait);
        let mut object = self.stat_locked(&r.object_id, &gate).await?;
        if object.directory {
            return Err(status(ErrorCode::IsDirectory));
        }
        let offset = if r.append { object.size } else { r.offset };
        offset
            .checked_add(r.data.len() as u64)
            .filter(|v| *v <= i64::MAX as u64)
            .ok_or_else(|| status(ErrorCode::InvalidInput))?;
        if r.data.is_empty() {
            return Ok(Mutation {
                object: Some(object),
                related: vec![],
            });
        }
        for (index, data) in r.data.chunks(MAX_WRITE).enumerate() {
            let offset = r
                .offset
                .checked_add((index * MAX_WRITE) as u64)
                .ok_or_else(|| status(ErrorCode::InvalidInput))?;
            let patch = WriteRequest {
                object_id: r.object_id.clone(),
                offset,
                data: data.to_vec(),
                append: r.append,
            };
            let mut projected = Some(object.clone());
            apply_metadata(
                &mut projected,
                &object.id,
                &Edit {
                    operation: Some(edit::Operation::Write(patch.clone())),
                },
            )?;
            let response = self
                .enqueue(
                    Edit {
                        operation: Some(edit::Operation::Write(patch)),
                    },
                    object.id.clone(),
                    vec![(object.id.clone(), Some(object))],
                    vec![],
                )
                .await?;
            object = response.object.ok_or_else(|| status(ErrorCode::Internal))?;
        }
        Ok(Mutation {
            object: Some(object),
            related: vec![],
        })
    }
    async fn remove(
        self: &Arc<Self>,
        parent: String,
        name: String,
        r: RemoveRequest,
    ) -> Result<Mutation> {
        let object = self.stat(&r.object_id).await?;
        if r.directory != object.directory {
            return Err(status(if object.directory {
                ErrorCode::IsDirectory
            } else {
                ErrorCode::NotDirectory
            }));
        }
        if object.directory
            && !self
                .list(ListRequest {
                    directory_id: object.id.clone(),
                    after: None,
                    limit: 64,
                })
                .await?
                .entries
                .is_empty()
        {
            return Err(status(ErrorCode::NotEmpty));
        }
        let parent = self.stat(&parent).await?;
        let _gates = self.lock_gates(&[&object.id, &parent.id]).await?;
        self.enqueue(
            Edit {
                operation: Some(edit::Operation::Remove(r)),
            },
            object.id.clone(),
            vec![
                (object.id.clone(), Some(object)),
                (parent.id.clone(), Some(parent.clone())),
            ],
            vec![(parent.id, name, None)],
        )
        .await
    }
    async fn rename(
        self: &Arc<Self>,
        old_parent: String,
        old_name: String,
        r: RenameRequest,
    ) -> Result<Mutation> {
        dfs_protocol::validate::name(&r.name)?;
        let object = self.stat(&r.object_id).await?;
        let source = self.stat(&old_parent).await?;
        let destination = self.stat(&r.parent_id).await?;
        if !destination.directory {
            return Err(status(ErrorCode::NotDirectory));
        }
        let victim = match self
            .lookup(LookupRequest {
                parent_id: r.parent_id.clone(),
                name: r.name.clone(),
            })
            .await
        {
            Ok(v) if v.id == object.id => {
                return Ok(Mutation {
                    object: Some(object),
                    related: vec![],
                });
            }
            Ok(v) => {
                if !r.replace {
                    return Err(status(ErrorCode::AlreadyExists));
                }
                Some(v)
            }
            Err(e) if code(&e) == ErrorCode::NotFound => None,
            Err(e) => return Err(e),
        };
        let mut participants = BTreeMap::from([
            (object.id.clone(), Some(object.clone())),
            (source.id.clone(), Some(source)),
            (destination.id.clone(), Some(destination)),
        ]);
        if let Some(victim) = victim {
            participants.insert(victim.id.clone(), Some(victim));
        }
        let ids: Vec<_> = participants.keys().map(String::as_str).collect();
        let _gates = self.lock_gates(&ids).await?;
        let bindings = vec![
            (old_parent, old_name, None),
            (r.parent_id.clone(), r.name.clone(), Some(object.id.clone())),
        ];
        self.enqueue(
            Edit {
                operation: Some(edit::Operation::Rename(r)),
            },
            object.id,
            participants.into_iter().collect(),
            bindings,
        )
        .await
    }
    async fn lock_gates(
        &self,
        ids: &[&str],
    ) -> Result<Vec<(Arc<Gate>, tokio::sync::OwnedMutexGuard<()>)>> {
        let ids: BTreeSet<_> = ids.iter().copied().collect();
        let mut guards = Vec::new();
        for id in ids {
            let gate = self.gate(id)?;
            let gate_wait = self.rpc.measure("wait.object_gate");
            let guard = gate.mutex.clone().lock_owned().await;
            drop(gate_wait);
            guards.push((gate, guard));
        }
        Ok(guards)
    }
    /// @cc [owner:spolu,label:concurrency;performance] bounded-ordered-acceptance
    /// Admission MUST reserve dirty memory before RAM acknowledgement and update the local view
    /// atomically. Coalescing MUST preserve edit order and the first edit's dispatch deadline.
    /// Dependencies MUST include required namespace edits without chaining unrelated sibling files.
    async fn enqueue(
        &self,
        edit: Edit,
        target: String,
        participants: Vec<(String, Option<Object>)>,
        bindings: Vec<(String, String, Option<String>)>,
    ) -> Result<Mutation> {
        self.check_error(&target)?;
        // Bound overlay replay on a hot object; membership edits are represented separately.
        let full = self
            .pending
            .lock()
            .objects
            .get(&target)
            .is_some_and(|n| n.primary.len() >= 64);
        if full {
            let _wait = self.rpc.measure("wait.overlay_limit");
            self.flush(&target).await?;
        }
        let bytes = edit_weight(&edit);
        let charge = self
            .reserve(
                4 * bytes
                    + participants
                        .iter()
                        .filter_map(|(_, o)| o.as_ref())
                        .map(object_weight)
                        .sum::<usize>()
                        * 3
                    + 4096,
            )
            .await?;
        let pins = participants
            .iter()
            .map(|(id, _)| self.gate(id))
            .collect::<Result<Vec<_>>>()?;
        let slot_wait = self.rpc.measure("wait.group_slot");
        let slot = self
            .group_slots
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| status(ErrorCode::Unavailable))?;
        drop(slot_wait);
        let received = Instant::now();
        let mut pending = self.pending.lock();
        if pending.sync_errors.len() >= MAX_GROUPS {
            return Err(status(ErrorCode::Capacity));
        }
        let deleted: Vec<_> = match edit.operation.as_ref() {
            Some(edit::Operation::Remove(_)) => vec![target.clone()],
            Some(edit::Operation::Rename(_)) => participants
                .iter()
                .filter(|(id, _)| {
                    id != &target && !bindings.iter().any(|(parent, _, _)| parent == id)
                })
                .map(|(id, _)| id.clone())
                .collect(),
            _ => vec![],
        };
        let mut projections = HashMap::new();
        for (id, base) in &participants {
            let mut projected = pending
                .objects
                .get(id)
                .map_or_else(|| base.clone(), |n| n.current.clone());
            apply_metadata(&mut projected, id, &edit)?;
            if deleted.contains(id) {
                projected = None;
            }
            projections.insert(id.clone(), projected);
        }
        let previous = pending
            .objects
            .get(&target)
            .and_then(|node| node.own_tail.clone());
        let merge = previous
            .as_ref()
            .and_then(|r| pending.groups.get(&r.id))
            .filter(|group| {
                !group.inflight
                    && !group.forced
                    && bindings.is_empty()
                    && group.operations.len() < 8
                    && merged_cost(group, &edit) <= MAX_GROUP_COST
                    && group.bytes + bytes <= MAX_IO / 2
                    && matches!(
                        edit.operation,
                        Some(edit::Operation::Update(_) | edit::Operation::Write(_))
                    )
                    && matches!(
                        group
                            .operations
                            .first()
                            .and_then(|e| e.rpc.operation.as_ref()),
                        Some(
                            edit::Operation::Create(_)
                                | edit::Operation::Update(_)
                                | edit::Operation::Write(_)
                        )
                    )
            })
            .map(|g| g.id);
        let receipt;
        if let Some(id) = merge {
            let group = pending
                .groups
                .get_mut(&id)
                .ok_or_else(|| status(ErrorCode::Internal))?;
            group.cost = merged_cost(group, &edit);
            group.bytes += bytes;
            if let Some(last) = group.operations.last_mut()
                && can_merge_write(&last.rpc, &edit)
            {
                let last = Arc::make_mut(last);
                if let (
                    Some(edit::Operation::Write(previous)),
                    Some(edit::Operation::Write(next)),
                ) = (&mut last.rpc.operation, &edit.operation)
                {
                    let offset = if previous.append {
                        previous.data.len()
                    } else {
                        (next.offset - previous.offset) as usize
                    };
                    previous
                        .data
                        .resize(previous.data.len().max(offset + next.data.len()), 0);
                    previous.data[offset..offset + next.data.len()].copy_from_slice(&next.data);
                }
                last._charges.push(charge.clone());
            } else {
                group.operations.push(Arc::new(Operation {
                    rpc: edit.clone(),
                    _charges: vec![charge.clone()],
                }));
            }
            receipt = group.receipt.clone();
        } else {
            pending.next += 1;
            let id = pending.next;
            receipt = Receipt::new(id);
            let mut dependencies = BTreeMap::new();
            for (id, _) in &participants {
                if let Some(tail) = pending.objects.get(id).and_then(|n| n.own_tail.clone()) {
                    dependencies.insert(tail.id, tail);
                }
                if id == &target
                    && matches!(edit.operation, Some(edit::Operation::Remove(_)))
                    && let Some(node) = pending.objects.get(id)
                {
                    for id in &node.pending {
                        if let Some(group) = pending.groups.get(id) {
                            dependencies.insert(*id, group.receipt.clone());
                        }
                    }
                }
            }
            for (parent, name, _) in &bindings {
                if let Some((&id, _)) = pending
                    .names
                    .get(parent)
                    .and_then(|n| n.get(name))
                    .and_then(|n| n.last_key_value())
                    && let Some(group) = pending.groups.get(&id)
                {
                    dependencies.insert(id, group.receipt.clone());
                }
            }
            let group = Group {
                id,
                target: target.clone(),
                participants: participants.iter().map(|(id, _)| id.clone()).collect(),
                operations: vec![Arc::new(Operation {
                    rpc: edit.clone(),
                    _charges: vec![charge.clone()],
                })],
                dependencies: dependencies.into_values().collect(),
                receipt: receipt.clone(),
                ready: received + Duration::from_millis(self.config.write_delay_ms),
                forced: false,
                inflight: false,
                dispatched: None,
                cost: edit_cost(&edit),
                bytes,
                bindings: bindings.clone(),
                deleted: deleted.clone(),
                _pins: pins,
                _charge: charge.clone(),
                _slot: slot,
            };
            pending.groups.insert(id, group);
        }
        for (id, base) in participants {
            // Each object owns its validity. A new UUID gets C from acceptance, independently
            // of its parent's remaining validity; editing an existing node never renews it.
            let expires = if base.is_none() {
                self.deadline(received)
            } else {
                self.cache
                    .lock()
                    .get(&Key::Object(id.clone()))
                    .map_or(received, |entry| entry.expires)
            };
            let node = pending.objects.entry(id.clone()).or_insert_with(|| Dirty {
                base: base.clone(),
                current: base,
                expires,
                pending: BTreeSet::new(),
                primary: BTreeSet::new(),
                own_tail: None,
                _charge: charge.clone(),
                _refresh_memory: None,
            });
            node.pending.insert(receipt.id);
            if id == target || deleted.contains(&id) {
                node.primary.insert(receipt.id);
            }
            if id == target {
                node.own_tail = Some(receipt.clone());
            }
            node.current = projections
                .remove(&id)
                .ok_or_else(|| status(ErrorCode::Internal))?;
            self.bump(&id);
            if id == target || deleted.contains(&id) {
                self.bump_primary(&id);
            }
            self.cache.lock().invalidate_directory(&id, false);
        }
        for (parent, name, value) in bindings {
            self.bump(&name_generation(&parent, &name));
            pending
                .names
                .entry(parent.clone())
                .or_default()
                .entry(name.clone())
                .or_default()
                .insert(receipt.id, value.clone());
            let mut cache = self.cache.lock();
            cache.exclude_name(&parent, &name);
            cache.remove(&Key::Name(parent.clone(), name.clone()));
        }
        if let Some(edit::Operation::Create(r)) = &edit.operation
            && r.directory
        {
            // A fresh UUID directory starts empty. Keep this deadline through publication; a
            // commit response validates metadata, not the directory's entire membership.
            self.cache.lock().remember_coverage(
                &ListRequest {
                    directory_id: r.object_id.clone(),
                    after: None,
                    limit: 64,
                },
                &Page::default(),
                std::iter::empty(),
                received,
                self.deadline(received),
            );
        }
        let result = Mutation {
            object: pending.objects.get(&target).and_then(|n| n.current.clone()),
            related: vec![],
        };
        drop(pending);
        self.changed.notify_one();
        Ok(result)
    }
    /// @cc [owner:spolu,label:error-handling;concurrency] independent-commit-outcomes
    /// Each group MUST complete on its own streamed result. Missing or uncertain outcomes MUST fail
    /// explicitly and MUST NOT be replayed. A failed prerequisite MUST fail dependent groups.
    fn dispatch(self: &Arc<Self>) {
        {
            let mut pending = self.pending.lock();
            let count = pending.retired.len().min(64);
            for _ in 0..count {
                let Some(id) = pending.retired.pop_front() else {
                    break;
                };
                if pending
                    .objects
                    .get(&id)
                    .is_none_or(|n| !n.pending.is_empty())
                {
                    continue;
                }
                if self
                    .gates
                    .lock()
                    .get(&id)
                    .is_some_and(|g| g.strong_count() > 0)
                {
                    pending.retired.push_back(id);
                } else {
                    pending.objects.remove(&id);
                }
            }
        }
        let Ok(permit) = self.write_slots.clone().try_acquire_owned() else {
            return;
        };
        let mut failed = Vec::new();
        let mut groups = Vec::new();
        let mut bytes = 0;
        {
            let mut pending = self.pending.lock();
            // Avoid self-contention without coupling receipts or fsync to a parent queue. Forced
            // groups bypass this preference; independent clients remain arbitrated by FDB.
            let mut busy: BTreeSet<_> = pending
                .groups
                .values()
                .filter(|g| g.inflight)
                .flat_map(|g| g.participants.iter().cloned())
                .collect();
            for group in pending.groups.values_mut() {
                if group.inflight {
                    continue;
                }
                if group
                    ._pins
                    .iter()
                    .any(|gate| gate.refreshes.load(Ordering::Acquire) != 0)
                {
                    continue;
                }
                let mut ready = true;
                for dependency in &group.dependencies {
                    match *dependency.result.borrow() {
                        Some(Ok(())) => (),
                        Some(Err(e)) => {
                            failed.push((group.id, e));
                            ready = false;
                            break;
                        }
                        None => {
                            ready = false;
                        }
                    }
                }
                if !ready || (!group.forced && Instant::now() < group.ready) {
                    continue;
                }
                let overdue = Instant::now()
                    >= group.ready + Duration::from_millis(1000 - self.config.write_delay_ms);
                if !group.forced
                    && !overdue
                    && group.participants.iter().any(|id| busy.contains(id))
                {
                    continue;
                }
                if groups.len() >= 32 || bytes + group.bytes > MAX_IO {
                    continue;
                }
                bytes += group.bytes;
                group.inflight = true;
                group.dispatched = Some(Instant::now());
                busy.extend(group.participants.iter().cloned());
                groups.push(MutationGroup {
                    id: group.id,
                    edits: group.operations.iter().map(|e| e.rpc.clone()).collect(),
                });
            }
        }
        for (id, error) in failed {
            self.finish(id, Err(error));
        }
        if groups.is_empty() {
            return;
        }
        let inner = self.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let ids: BTreeSet<_> = groups.iter().map(|g| g.id).collect();
            let exchange = async {
                if let Ok(mut stream) = inner.rpc.mutate_batch(MutateBatchRequest { groups }).await
                {
                    loop {
                        match stream.message().await {
                            Ok(Some(result)) if ids.contains(&result.id) => {
                                let outcome =
                                    match (result.mutation, result.error) {
                                        (Some(m), None) => Ok(m),
                                        (_, Some(e)) => Err(ErrorCode::try_from(e.code)
                                            .unwrap_or(ErrorCode::Internal)),
                                        _ => Err(ErrorCode::Internal),
                                    };
                                inner.finish(result.id, outcome);
                            }
                            _ => break,
                        }
                    }
                }
            };
            let _ = tokio::time::timeout(Duration::from_secs(30), exchange).await;
            // Missing outcomes are uncertain and must never be replayed.
            for id in ids {
                inner.finish(id, Err(ErrorCode::Unavailable));
            }
        });
    }
    /// @cc [owner:spolu,label:concurrency;performance] canonical-write-response-renews-validity
    /// Successful publication MUST install all returned objects and confirmed name bindings with a
    /// full C from receipt (capped by session expiry), replaying later edits without an extra Stat.
    /// It MUST NOT renew directory coverage or relabel old blocks with the new revision.
    fn finish(&self, id: u64, result: std::result::Result<Mutation, ErrorCode>) {
        let mut pending = self.pending.lock();
        let Some(group) = pending.groups.remove(&id) else {
            return;
        };
        if let Some(started) = group.dispatched {
            self.rpc
                .record("writeback.group", started.elapsed(), result.is_err());
        }
        if let Err(error) = result {
            let name = match error {
                ErrorCode::Unavailable => "writeback.error.unavailable",
                ErrorCode::NotFound => "writeback.error.not_found",
                ErrorCode::AlreadyExists => "writeback.error.already_exists",
                ErrorCode::Capacity => "writeback.error.capacity",
                _ => "writeback.error.other",
            };
            self.rpc.record(name, Duration::ZERO, true);
        }
        let received = Instant::now();
        let canonical: HashMap<_, _> = result
            .as_ref()
            .ok()
            .into_iter()
            .flat_map(|m| m.object.iter().chain(&m.related))
            .map(|o| (o.id.clone(), o.clone()))
            .collect();
        if let Err(error) = result {
            pending.errors.insert(group.target.clone(), error);
            for participant in &group.participants {
                pending.sync_errors.insert(participant.clone(), error);
            }
        }
        for participant in &group.participants {
            self.bump(participant);
            if participant == &group.target || group.deleted.contains(participant) {
                self.bump_primary(participant);
            }
            if result.is_err() || group.deleted.contains(participant) {
                self.cache
                    .lock()
                    .remove(&Key::Coverage(participant.clone()));
            }
            self.cache.lock().remove(&Key::Object(participant.clone()));
            self.cache.lock().invalidate_directory(participant, false);
            let operations = pending
                .objects
                .get(participant)
                .map(|n| {
                    n.primary
                        .iter()
                        .filter(|&&other| other != id)
                        .filter_map(|id| pending.groups.get(id))
                        .map(|g| (g.operations.clone(), g.deleted.contains(participant)))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if let Some(node) = pending.objects.get_mut(participant) {
                node.pending.remove(&id);
                node.primary.remove(&id);
                if result.is_ok() {
                    if let Some(object) = canonical.get(participant) {
                        node.base = Some(object.clone());
                    } else if group.deleted.contains(participant) {
                        node.base = None;
                    }
                    node.expires = self.deadline(received);
                }
                node.current = node.base.clone();
                for (operations, deleted) in operations {
                    for operation in operations {
                        if apply_metadata(&mut node.current, participant, &operation.rpc).is_err() {
                            // A concurrent commit can invalidate a tentative projection. Hide it;
                            // publication still reports the authoritative per-group outcome.
                            node.current = None;
                            break;
                        }
                    }
                    if deleted {
                        node.current = None;
                    }
                }
                if !node.pending.is_empty()
                    && let Some(object) = &mut node.current
                {
                    object.revision.clear();
                }
                if node.pending.is_empty() {
                    pending.retired.push_back(participant.clone());
                }
            }
            if let Some(object) = canonical.get(participant) {
                self.remember_object(object, received, received);
            } else if result.is_ok() && group.deleted.contains(participant) {
                self.cache.lock().insert(
                    Key::Object(participant.clone()),
                    Value::Absent,
                    received,
                    self.deadline(received),
                );
            }
        }
        for (parent, name, value) in &group.bindings {
            self.bump(&name_generation(parent, name));
            self.cache.lock().exclude_name(parent, name);
            if let Some(names) = pending.names.get_mut(parent) {
                if let Some(versions) = names.get_mut(name) {
                    versions.remove(&id);
                    if versions.is_empty() {
                        names.remove(name);
                    }
                }
                if names.is_empty() {
                    pending.names.remove(parent);
                }
            }
            self.cache
                .lock()
                .remove(&Key::Name(parent.clone(), name.clone()));
            if result.is_ok() && pending.binding(parent, name).is_none() {
                self.cache.lock().insert(
                    Key::Name(parent.clone(), name.clone()),
                    Value::Name(value.clone()),
                    received,
                    self.deadline(received),
                );
            }
        }
        group.receipt.result.send_replace(Some(result.map(|_| ())));
        drop(pending);
        self.changed.notify_one();
    }
}

fn timestamp() -> Result<Timestamp> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| status(ErrorCode::Internal))?;
    Ok(Timestamp {
        seconds: duration.as_secs() as i64,
        nanos: duration.subsec_nanos(),
    })
}
fn new_object(r: &CreateRequest) -> Result<Object> {
    let now = timestamp()?;
    let object = Object {
        id: r.object_id.clone(),
        directory: r.directory,
        size: 0,
        mode: r.mode,
        mime_type: r.mime_type.clone().unwrap_or_else(|| {
            if r.directory {
                "inode/directory"
            } else {
                "application/octet-stream"
            }
            .into()
        }),
        xattrs: r.xattrs.clone(),
        atime: Some(now),
        mtime: Some(now),
        ctime: Some(now),
        revision: vec![],
    };
    dfs_protocol::validate::attributes(&object.mime_type, &object.xattrs, object.mode)?;
    Ok(object)
}
fn apply_metadata(object: &mut Option<Object>, id: &str, edit: &Edit) -> Result<()> {
    use edit::Operation;
    match edit
        .operation
        .as_ref()
        .ok_or_else(|| status(ErrorCode::InvalidInput))?
    {
        Operation::Create(r) if r.object_id == id => {
            *object = Some(new_object(r)?);
        }
        Operation::Remove(r) if r.object_id == id => {
            *object = None;
        }
        Operation::Write(r) if r.object_id == id => {
            let object = object.as_mut().ok_or_else(|| status(ErrorCode::NotFound))?;
            if object.directory {
                return Err(status(ErrorCode::IsDirectory));
            }
            let offset = if r.append { object.size } else { r.offset };
            let end = offset
                .checked_add(r.data.len() as u64)
                .filter(|v| *v <= i64::MAX as u64)
                .ok_or_else(|| status(ErrorCode::InvalidInput))?;
            object.size = object.size.max(end);
        }
        Operation::Update(r) if r.object_id == id => {
            let object = object.as_mut().ok_or_else(|| status(ErrorCode::NotFound))?;
            if let Some(size) = r.size {
                if object.directory {
                    return Err(status(ErrorCode::IsDirectory));
                }
                if size > i64::MAX as u64 {
                    return Err(status(ErrorCode::InvalidInput));
                }
                object.size = size;
            }
            if let Some(mode) = r.mode {
                object.mode = mode;
            }
            if let Some(mime) = &r.mime_type {
                object.mime_type = mime.clone();
            }
            for attr in &r.xattrs {
                match &attr.value {
                    Some(v) => {
                        object.xattrs.insert(attr.name.clone(), v.clone());
                    }
                    None => {
                        object.xattrs.remove(&attr.name);
                    }
                }
            }
            if let Some(atime) = r.atime {
                dfs_protocol::validate::timestamp(&atime)?;
                object.atime = Some(atime);
            }
            if let Some(mtime) = r.mtime {
                dfs_protocol::validate::timestamp(&mtime)?;
                object.mtime = Some(mtime);
            }
            dfs_protocol::validate::attributes(&object.mime_type, &object.xattrs, object.mode)?;
        }
        _ => (),
    }
    if let Some(object) = object {
        object.ctime = Some(timestamp()?);
        object.revision.clear();
    }
    Ok(())
}
fn edit_weight(edit: &Edit) -> usize {
    match &edit.operation {
        Some(edit::Operation::Write(r)) => r.data.len() + 256,
        Some(edit::Operation::Update(r)) => {
            r.xattrs
                .iter()
                .map(|x| x.name.len() + x.value.as_ref().map_or(0, Vec::len))
                .sum::<usize>()
                + 1024
        }
        Some(edit::Operation::Create(r)) => {
            r.xattrs
                .iter()
                .map(|(k, v)| k.len() + v.len())
                .sum::<usize>()
                + 1024
        }
        _ => 1024,
    }
}
fn edit_cost(edit: &Edit) -> usize {
    match &edit.operation {
        Some(edit::Operation::Write(r)) => {
            ((r.offset as usize % BLOCK_SIZE + r.data.len()).div_ceil(BLOCK_SIZE)) * BLOCK_SIZE
                + 96 * 1024
        }
        Some(edit::Operation::Create(_)) => 192 * 1024,
        _ => 96 * 1024,
    }
}
fn can_merge_write(previous: &Edit, next: &Edit) -> bool {
    let (Some(edit::Operation::Write(a)), Some(edit::Operation::Write(b))) =
        (&previous.operation, &next.operation)
    else {
        return false;
    };
    if a.object_id != b.object_id || a.append != b.append {
        return false;
    }
    if a.append {
        return a.data.len() + b.data.len() <= MAX_WRITE;
    }
    b.offset >= a.offset
        && b.offset <= a.offset + a.data.len() as u64
        && (b.offset - a.offset) as usize + b.data.len() <= MAX_WRITE
}
fn merged_cost(group: &Group, next: &Edit) -> usize {
    let cost: usize = group
        .operations
        .iter()
        .map(|operation| edit_cost(&operation.rpc))
        .sum();
    if let Some(last) = group.operations.last()
        && can_merge_write(&last.rpc, next)
        && let (Some(edit::Operation::Write(a)), Some(edit::Operation::Write(b))) =
            (&last.rpc.operation, &next.operation)
    {
        let length = if a.append {
            a.data.len() + b.data.len()
        } else {
            a.data
                .len()
                .max((b.offset - a.offset) as usize + b.data.len())
        };
        cost - edit_cost(&last.rpc)
            + (a.offset as usize % BLOCK_SIZE + length).div_ceil(BLOCK_SIZE) * BLOCK_SIZE
            + 96 * 1024
    } else {
        cost + edit_cost(next)
    }
}
