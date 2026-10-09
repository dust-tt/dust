use super::*;
use dfs_protocol::ObjectRef;
use dfs_protocol::Revision;
use memory::object_weight;
use std::collections::{BTreeMap, BTreeSet};
use tokio::sync::{OwnedSemaphorePermit, watch};
mod refresh;
#[cfg(test)]
mod tests;

const MAX_GROUP_COST: usize = 900_000;
const MAX_WRITE: usize = 256 * 1024;
pub(super) const MAX_GROUPS: usize = 4096;

#[derive(Clone)]
struct Operation {
    rpc: Edit,
    _charges: Vec<Arc<OwnedSemaphorePermit>>,
}
struct Receipt {
    id: u64,
    result: watch::Sender<Option<std::result::Result<(), ErrorCode>>>,
    submitted: std::sync::OnceLock<Instant>,
    completed: std::sync::OnceLock<Instant>,
}
impl Receipt {
    fn new(id: u64) -> Arc<Self> {
        Arc::new(Self {
            id,
            result: watch::channel(None).0,
            submitted: Default::default(),
            completed: Default::default(),
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
    target: ObjectRef,
    participants: Vec<ObjectRef>,
    operations: Vec<Arc<Operation>>,
    dependencies: Vec<Arc<Receipt>>,
    receipt: Arc<Receipt>,
    accepted: Instant,
    ready: Instant,
    forced: bool,
    forced_at: Option<Instant>,
    inflight: bool,
    dispatched: Option<Instant>,
    cost: usize,
    bytes: usize,
    bindings: Vec<(ObjectRef, String, Option<ObjectRef>)>,
    deleted: Vec<ObjectRef>,
    _pins: Vec<Arc<Gate>>,
    _charge: Arc<OwnedSemaphorePermit>,
    _slot: OwnedSemaphorePermit,
    envelope: Option<OwnedSemaphorePermit>,
}
struct Dirty {
    base: Option<Attr>,
    current: Option<Attr>,
    expires: Instant,
    pending: BTreeSet<u64>,
    primary: BTreeSet<u64>,
    own_tail: Option<Arc<Receipt>>,
    retired: bool,
    _charge: Arc<OwnedSemaphorePermit>,
    _refresh_memory: Option<OwnedSemaphorePermit>,
}
impl Group {
    /// @cc [owner:spolu,label:performance;concurrency] client-controlled-buffering-clock
    /// The dispatch deadline MUST exclude only actual prerequisite RPC wait intervals after this
    /// group's acceptance. Overlapping intervals MUST count once. Queued prerequisite time and
    /// local scheduling MUST remain charged; coalescing MUST NOT reset acceptance time.
    fn buffered_for(&self, now: Instant) -> Duration {
        buffered_for(self.accepted, now, &self.dependencies)
    }

    /// @cc [owner:spolu,label:concurrency;performance] primary-refresh-dispatch-pause
    /// Metadata refresh MAY pause edits to its primary object or a replaced object. Refreshing a
    /// membership-only parent MUST NOT block independent child groups or consume their deadlines.
    fn refreshing(&self) -> bool {
        self.participants.iter().zip(&self._pins).any(|(id, gate)| {
            (id == &self.target || self.deleted.contains(id))
                && gate.refreshes.load(Ordering::Acquire) != 0
        })
    }

    fn primary(&self) -> &ObjectRef {
        match self
            .operations
            .first()
            .and_then(|e| e.rpc.operation.as_ref())
        {
            Some(edit::Operation::Create(r)) => &r.parent_id,
            _ => &self.target,
        }
    }
}
#[derive(Default)]
pub(super) struct Pending {
    groups: BTreeMap<u64, Group>,
    objects: BTreeMap<ObjectRef, Dirty>,
    names: BTreeMap<ObjectRef, BTreeMap<String, BTreeMap<u64, Option<ObjectRef>>>>,
    errors: BTreeMap<ObjectRef, ErrorCode>,
    sync_errors: BTreeMap<ObjectRef, ErrorCode>,
    next: u64,
    retired: std::collections::VecDeque<ObjectRef>,
    last_primary: Option<ObjectRef>,
}
impl Pending {
    /// @cc [owner:spolu,label:performance;concurrency] fair-ready-groups
    /// Selection MUST preserve explicit dependencies and rotate across ready primary objects.
    /// Independent groups MUST remain separate. Membership-only parent overlaps MUST NOT serialize
    /// sibling groups. Fsync and exhausted admission capacity MAY bypass coalescing, never
    /// dependencies, refresh pauses or byte limits. Reserved dispatch capacity MUST NOT sit idle
    /// solely for coalescing while all envelope reservations are occupied.
    fn select(&self, limit: usize, capacity_full: bool) -> (Vec<u64>, Vec<(u64, ErrorCode)>) {
        let now = Instant::now();
        let mut queues: BTreeMap<&ObjectRef, std::collections::VecDeque<&Group>> = BTreeMap::new();
        let mut failed = Vec::new();
        for group in self.groups.values().filter(|g| !g.inflight) {
            if group.refreshing() {
                continue;
            }
            let mut ready = true;
            for dependency in &group.dependencies {
                match *dependency.result.borrow() {
                    Some(Ok(())) => (),
                    Some(Err(error)) => {
                        failed.push((group.id, error));
                        ready = false;
                        break;
                    }
                    None => {
                        ready = false;
                    }
                }
            }
            if ready && (capacity_full || group.forced || now >= group.ready) {
                queues.entry(group.primary()).or_default().push_back(group);
            }
        }
        let mut queues: Vec<_> = queues.into_iter().collect();
        let start = self
            .last_primary
            .as_ref()
            .map_or(0, |last| queues.partition_point(|(id, _)| *id <= last));
        queues.rotate_left(start);
        let mut queues: std::collections::VecDeque<_> = queues.into();
        let mut selected = Vec::new();
        let mut bytes = 0;
        while selected.len() < limit
            && let Some((primary, mut queue)) = queues.pop_front()
        {
            if let Some(group) = queue.pop_front()
                && bytes + group.bytes <= MAX_IO
            {
                selected.push(group.id);
                bytes += group.bytes;
            }
            if !queue.is_empty() {
                queues.push_back((primary, queue));
            }
        }
        (selected, failed)
    }
    fn merge_target(
        &self,
        target: &ObjectRef,
        edit: &Edit,
        bytes: usize,
        no_bindings: bool,
    ) -> Option<u64> {
        let previous = self
            .objects
            .get(target)
            .and_then(|node| node.own_tail.clone());
        previous
            .as_ref()
            .and_then(|r| self.groups.get(&r.id))
            .filter(|group| {
                !group.inflight
                    && !group.forced
                    && no_bindings
                    && group.operations.len() < 8
                    && merged_cost(group, edit) <= MAX_GROUP_COST
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
            .map(|g| g.id)
    }

    pub fn names(&self, parent: &ObjectRef) -> impl Iterator<Item = &str> {
        self.names
            .get(parent)
            .into_iter()
            .flat_map(|names| names.keys().map(String::as_str))
    }
    pub fn local_directory(&self, id: &ObjectRef) -> bool {
        self.objects.get(id).is_some_and(|node| {
            node.base.is_none() && node.current.as_ref().is_some_and(|o| o.directory)
        })
    }
    /// @cc [owner:spolu,label:performance;concurrency] bounded-directory-overlay
    /// Merge ordered server entries and local names without copying them into another full index.
    /// Local edits MUST win within the page's cursor range; output MUST preserve order, limits and
    /// continuation through deleted tails. Transient storage MUST remain bounded by two entry arrays.
    pub fn overlay_page(&self, request: &ListRequest, mut page: Page) -> Page {
        if request.directory_id == ObjectRef::Shared {
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
        let capacity = (request.limit as usize).min(page.entries.len() + names.len());
        let mut entries = page.entries.into_iter().peekable();
        let mut local = names
            .iter()
            .filter_map(|(name, versions)| {
                if request.after.as_ref().is_some_and(|after| name <= after)
                    || boundary.as_ref().is_some_and(|end| name > end)
                {
                    return None;
                }
                match versions.last_key_value().and_then(|(_, id)| id.as_ref()) {
                    Some(id) => self
                        .object(id)
                        .and_then(Result::ok)
                        .map(|object| (name, Some(object))),
                    None => Some((name, None)),
                }
            })
            .peekable();
        let mut more = false;
        let mut bytes = 0;
        let mut output = Vec::with_capacity(capacity);
        while entries.peek().is_some() || local.peek().is_some() {
            let next = if local
                .peek()
                .is_some_and(|(name, _)| entries.peek().is_none_or(|entry| **name <= entry.name))
            {
                local.next().and_then(|(name, object)| {
                    if entries.peek().is_some_and(|entry| entry.name == *name) {
                        entries.next();
                    }
                    object.map(|object| Entry {
                        name: name.clone(),
                        object: Some(object),
                    })
                })
            } else {
                entries.next()
            };
            let Some(mut entry) = next else { continue };
            if let Some(object) = &entry.object
                && let Some(Ok(current)) = self.object(&object.id)
            {
                entry.object = Some(current);
            }
            bytes += entry.object.as_ref().map_or(0, object_weight) + entry.name.len();
            if output.len() == request.limit as usize || (bytes > MAX_IO && !output.is_empty()) {
                more = true;
                break;
            }
            output.push(entry);
        }
        Page {
            view: page.view,
            listing_token: Vec::new(),
            next_after: if more {
                output.last().map(|e| e.name.clone())
            } else {
                boundary
            },
            entries: output,
        }
    }
    pub fn object(&self, id: &ObjectRef) -> Option<Result<Attr>> {
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
    pub fn contains(&self, id: &ObjectRef) -> bool {
        self.objects.get(id).is_some_and(|n| !n.pending.is_empty())
    }
    pub fn binding(&self, parent: &ObjectRef, name: &str) -> Option<Option<ObjectRef>> {
        self.names
            .get(parent)?
            .get(name)?
            .last_key_value()
            .map(|(_, id)| *id)
    }
    fn force(&mut self, id: &ObjectRef) -> Option<Vec<Arc<Receipt>>> {
        if crate::inline::active() && self.contains(id) {
            return None;
        }
        let receipts: Vec<_> = self
            .objects
            .get(id)
            .into_iter()
            .flat_map(|n| &n.pending)
            .filter_map(|id| self.groups.get(id).map(|g| g.receipt.clone()))
            .collect();
        self.force_prefix(&receipts);
        Some(receipts)
    }
    fn force_prefix(&mut self, receipts: &[Arc<Receipt>]) {
        let mut stack = receipts.to_vec();
        let mut seen = BTreeSet::new();
        while let Some(receipt) = stack.pop() {
            if !seen.insert(receipt.id) {
                continue;
            }
            if let Some(group) = self.groups.get_mut(&receipt.id) {
                group.forced = true;
                group.forced_at.get_or_insert_with(Instant::now);
                stack.extend(group.dependencies.iter().cloned());
            }
        }
    }
    fn dependencies(
        &self,
        target: &ObjectRef,
        edit: &Edit,
        participants: &[(ObjectRef, Option<Attr>)],
        bindings: &[(ObjectRef, String, Option<ObjectRef>)],
    ) -> Vec<Arc<Receipt>> {
        let mut dependencies = BTreeMap::new();
        for (id, _) in participants {
            if let Some(tail) = self.objects.get(id).and_then(|n| n.own_tail.clone()) {
                dependencies.insert(tail.id, tail);
            }
            if id == target
                && matches!(edit.operation, Some(edit::Operation::Remove(_)))
                && let Some(node) = self.objects.get(id)
            {
                for id in &node.pending {
                    if let Some(group) = self.groups.get(id) {
                        dependencies.insert(*id, group.receipt.clone());
                    }
                }
            }
        }
        for (parent, name, _) in bindings {
            if let Some((&id, _)) = self
                .names
                .get(parent)
                .and_then(|n| n.get(name))
                .and_then(|n| n.last_key_value())
                && let Some(group) = self.groups.get(&id)
            {
                dependencies.insert(id, group.receipt.clone());
            }
        }
        dependencies.into_values().collect()
    }
}

impl CachedClient {
    pub fn create(&self, r: CreateRequest) -> Result<Mutation> {
        self.run(self.inner.create(r))
    }
    pub fn update(&self, r: UpdateRequest) -> Result<Mutation> {
        self.run(self.inner.update(r))
    }
    pub fn write(&self, r: WriteRequest) -> Result<Mutation> {
        self.run(self.inner.write(r))
    }
    pub fn remove_at(&self, parent: ObjectRef, name: String, r: RemoveRequest) -> Result<Mutation> {
        self.run(self.inner.remove(parent, name, r))
    }
    pub fn rename_from(
        &self,
        parent: ObjectRef,
        name: String,
        r: RenameRequest,
    ) -> Result<Mutation> {
        self.run(self.inner.rename(parent, name, r))
    }
    /// @cc [owner:spolu,label:concurrency] finite-object-barrier
    /// Fsync MUST wait only the captured target prefix and its prerequisites. It MUST NOT perform
    /// a subsequent cache refresh that could flush edits accepted after the barrier.
    pub fn fsync(&self, r: ObjectRequest) -> Result<()> {
        self.run(self.inner.flush(&r.object_id))
    }
    pub fn drain(&self) -> Result<()> {
        self.run(async {
            crate::inline::blocking_point().await;
            let receipts = {
                let mut pending = self.inner.pending.lock();
                pending
                    .groups
                    .values_mut()
                    .map(|g| {
                        g.forced = true;
                        g.forced_at.get_or_insert_with(Instant::now);
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
    pub fn check_error(&self, id: &ObjectRef) -> Result<()> {
        self.inner.check_error(id)
    }
}
impl Inner {
    /// @cc [owner:spolu,label:concurrency;performance] sparse-overlay-base-reads
    /// Reads MUST fetch base bytes only where no pending write or truncation supersedes them.
    /// Truncation followed by extension MUST expose zeros, never resurrect the old base tail.
    /// All base fetches MUST use the same expected revision before applying ordered local edits.
    pub(super) async fn read_overlay(
        &self,
        object: &Attr,
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
        let end = offset + wanted as u64;
        let mut data = vec![0; wanted];
        if let Some(base) = &base {
            let mut ranges = BTreeMap::new();
            if offset < base.size.min(end) {
                ranges.insert(offset, base.size.min(end));
            }
            let mut size = base.size;
            for edit in &edits {
                match &edit.rpc.operation {
                    Some(edit::Operation::Write(r)) if r.object_id == object.id => {
                        let start = if r.append { size } else { r.offset };
                        let write_end = start + r.data.len() as u64;
                        subtract_base(&mut ranges, start, write_end);
                        size = size.max(write_end);
                    }
                    Some(edit::Operation::Update(r)) if r.object_id == object.id => {
                        if let Some(new_size) = r.size {
                            if new_size < size {
                                subtract_base(&mut ranges, new_size, u64::MAX);
                            }
                            size = new_size;
                        }
                    }
                    _ => (),
                }
            }
            for (from, to) in ranges {
                let bytes = self.read_base(base, from, (to - from) as u32).await?;
                if bytes.len() != (to - from) as usize {
                    return Err(status(ErrorCode::StaleView));
                }
                data[(from - offset) as usize..(to - offset) as usize].copy_from_slice(&bytes);
            }
        }
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
    fn check_error(&self, id: &ObjectRef) -> Result<()> {
        self.active()?;
        match self.pending.lock().errors.get(id) {
            Some(e) => Err(status(*e)),
            None => Ok(()),
        }
    }
    pub(super) async fn flush(&self, id: &ObjectRef) -> Result<()> {
        self.active()?;
        let receipts = loop {
            if let Some(receipts) = self.pending.lock().force(id) {
                break receipts;
            }
            crate::inline::blocking_point().await;
        };
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
    /// @cc [owner:spolu,label:performance;concurrency] shared-memory-admission
    /// Writes MUST share the clean-cache/bookkeeping budget, evicting clean entries before waiting.
    /// Reservations MUST cover queued and in-flight payload lifetimes. Oversized requests MUST fail
    /// without waiting; acknowledged dirty state MUST NOT be evicted to admit another write.
    async fn reserve(&self, bytes: usize) -> Result<Arc<OwnedSemaphorePermit>> {
        let bytes = u32::try_from(bytes).map_err(|_| status(ErrorCode::Capacity))?;
        if bytes as usize > (self.config.cache_mib - IO_RESERVE_MIB) * 1024 * 1024 {
            return Err(status(ErrorCode::Capacity));
        }
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
        self.cache.lock().usage();
        drop(memory_wait);
        Ok(Arc::new(memory))
    }
    async fn create(self: &Arc<Self>, mut r: CreateRequest) -> Result<Mutation> {
        dfs_protocol::validate::name(&r.name)?;
        let parent = self.stat(&r.parent_id).await?;
        if !parent.directory {
            return Err(status(ErrorCode::NotDirectory));
        }
        match self
            .lookup(LookupRequest {
                parent_id: r.parent_id,
                name: r.name.clone(),
            })
            .await
        {
            Ok(_) => return Err(status(ErrorCode::AlreadyExists)),
            Err(e) if code(&e) == ErrorCode::NotFound => (),
            Err(e) => return Err(e),
        }
        r.object_id = ObjectRef::new_v4();
        let mut object = new_object(&r)?;
        object.revision.clear();
        let bindings = vec![(r.parent_id, r.name.clone(), Some(r.object_id))];
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
                .fresh(&Key::Name(r.parent_id, r.name.clone()))
                .is_some_and(|e| {
                    matches!(
                        &e.value,
                        Value::Name(Name {
                            object_id: Some(_),
                            ..
                        })
                    )
                })
        {
            return Err(status(ErrorCode::AlreadyExists));
        }
        self.enqueue(
            Edit {
                operation: Some(edit::Operation::Create(r)),
            },
            object.id,
            vec![(parent.id, Some(parent)), (object.id, None)],
            bindings,
        )
        .await?;
        Ok(Mutation {
            commit_version: 0,
            object: Some(object),
            related: vec![],
        })
    }
    async fn update(self: &Arc<Self>, r: UpdateRequest) -> Result<Mutation> {
        let gate = self.gate(&r.object_id)?;
        let gate_wait = self.rpc.measure("wait.object_gate");
        let _guard = gate.mutex.lock().await;
        drop(gate_wait);
        if r.mime_type.is_some() || !r.xattrs.is_empty() {
            let mut metadata = self.metadata_locked(&r.object_id, &gate).await?;
            if let Some(mime) = &r.mime_type {
                metadata.mime_type.clone_from(mime);
            }
            let mut names = BTreeSet::new();
            for change in &r.xattrs {
                if !names.insert(&change.name) {
                    return Err(status(ErrorCode::InvalidInput));
                }
                match &change.value {
                    Some(value) => {
                        metadata.xattrs.insert(change.name.clone(), value.clone());
                    }
                    None => {
                        metadata.xattrs.remove(&change.name);
                    }
                }
            }
            dfs_protocol::validate::attributes(
                &metadata.mime_type,
                &metadata.xattrs,
                r.mode.unwrap_or(metadata.object.mode),
            )?;
        }
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
            object.id,
            vec![(object.id, Some(object))],
            vec![],
        )
        .await
    }
    async fn write(self: &Arc<Self>, r: WriteRequest) -> Result<Mutation> {
        if r.data.len() > MAX_IO {
            return Err(status(ErrorCode::InvalidInput));
        }
        if r.data.len() > MAX_WRITE {
            crate::inline::blocking_point().await;
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
                commit_version: 0,
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
                object_id: r.object_id,
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
                    object.id,
                    vec![(object.id, Some(object))],
                    vec![],
                )
                .await?;
            object = response.object.ok_or_else(|| status(ErrorCode::Internal))?;
        }
        Ok(Mutation {
            commit_version: 0,
            object: Some(object),
            related: vec![],
        })
    }
    async fn remove(
        self: &Arc<Self>,
        parent: ObjectRef,
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
                    directory_id: object.id,
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
            object.id,
            vec![(object.id, Some(object)), (parent.id, Some(parent.clone()))],
            vec![(parent.id, name, None)],
        )
        .await
    }
    async fn rename(
        self: &Arc<Self>,
        old_parent: ObjectRef,
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
                parent_id: r.parent_id,
                name: r.name.clone(),
            })
            .await
        {
            Ok(v) if v.id == object.id => {
                return Ok(Mutation {
                    commit_version: 0,
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
            (object.id, Some(object.clone())),
            (source.id, Some(source)),
            (destination.id, Some(destination)),
        ]);
        if let Some(victim) = victim {
            participants.insert(victim.id, Some(victim));
        }
        let ids: Vec<_> = participants.keys().collect();
        let _gates = self.lock_gates(&ids).await?;
        let bindings = vec![
            (old_parent, old_name, None),
            (r.parent_id, r.name.clone(), Some(object.id)),
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
        ids: &[&ObjectRef],
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
    /// Queued and in-flight groups MUST share the configured concurrency admission limit, so a
    /// saturated server applies backpressure before acknowledging more buffered edits.
    /// Each new group MUST reserve an RPC envelope before acknowledgment. Combining ready groups
    /// MAY share one reservation and return the extras; no accepted group may wait for an envelope.
    /// A new group whose prerequisite still awaits another prerequisite MUST wait for that finite
    /// prefix before acceptance. Directory removal MUST await its captured child edits before
    /// acceptance. Inline probes MUST defer before forcing either prefix.
    async fn enqueue(
        &self,
        edit: Edit,
        target: ObjectRef,
        participants: Vec<(ObjectRef, Option<Attr>)>,
        bindings: Vec<(ObjectRef, String, Option<ObjectRef>)>,
    ) -> Result<Mutation> {
        self.check_error(&target)?;
        let bytes = edit_weight(&edit);
        // Backpressure precedes acknowledgment: a hot file cannot accumulate a long dependency
        // chain that will consume the write-buffer deadline while earlier groups commit.
        let full = {
            let pending = self.pending.lock();
            pending
                .objects
                .get(&target)
                .is_some_and(|n| n.primary.len() >= 2)
                && pending
                    .merge_target(&target, &edit, bytes, bindings.is_empty())
                    .is_none()
        };
        if full {
            let _wait = self.rpc.measure("wait.overlay_limit");
            self.flush(&target).await?;
        }
        let prerequisites = {
            let pending = self.pending.lock();
            let dependencies = pending.dependencies(&target, &edit, &participants, &bindings);
            if pending
                .merge_target(&target, &edit, bytes, bindings.is_empty())
                .is_none()
                && (matches!(edit.operation, Some(edit::Operation::Remove(ref request)) if request.directory)
                    || dependencies.iter().any(|receipt| {
                        pending.groups.get(&receipt.id).is_some_and(|group| {
                            group
                                .dependencies
                                .iter()
                                .any(|parent| parent.result.borrow().is_none())
                        })
                    }))
            {
                dependencies
            } else {
                Vec::new()
            }
        };
        if !prerequisites.is_empty() {
            crate::inline::blocking_point().await;
            let _wait = self.rpc.measure("wait.prerequisite_progress");
            self.pending.lock().force_prefix(&prerequisites);
            self.changed.notify_one();
            for receipt in prerequisites {
                receipt.wait().await?;
            }
        }
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
        let mut slot = None;
        let mut envelope = None;
        let (mut pending, merge) = loop {
            {
                let pending = self.pending.lock();
                let merge = pending.merge_target(&target, &edit, bytes, bindings.is_empty());
                if merge.is_some() || (slot.is_some() && envelope.is_some()) {
                    break (pending, merge);
                }
            }
            let _wait = self.rpc.measure("wait.group_slot");
            slot = Some(
                self.group_slots
                    .clone()
                    .acquire_owned()
                    .await
                    .map_err(|_| status(ErrorCode::Unavailable))?,
            );
            drop(_wait);
            let _wait = self.rpc.measure("wait.envelope_admission");
            envelope = Some(
                self.write_slots
                    .clone()
                    .acquire_owned()
                    .await
                    .map_err(|_| status(ErrorCode::Unavailable))?,
            );
        };
        let received = Instant::now();
        if pending.sync_errors.len() >= MAX_GROUPS {
            return Err(status(ErrorCode::Capacity));
        }
        let deleted: Vec<_> = match edit.operation.as_ref() {
            Some(edit::Operation::Remove(_)) => vec![target],
            Some(edit::Operation::Rename(_)) => participants
                .iter()
                .filter(|(id, _)| {
                    id != &target && !bindings.iter().any(|(parent, _, _)| parent == id)
                })
                .map(|(id, _)| *id)
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
            projections.insert(*id, projected);
        }
        crate::inline::accept();
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
            let dependencies = pending.dependencies(&target, &edit, &participants, &bindings);
            let group = Group {
                id,
                target,
                participants: participants.iter().map(|(id, _)| *id).collect(),
                operations: vec![Arc::new(Operation {
                    rpc: edit.clone(),
                    _charges: vec![charge.clone()],
                })],
                dependencies,
                receipt: receipt.clone(),
                accepted: received,
                ready: received + Duration::from_millis(self.config.write_delay_ms),
                forced: false,
                forced_at: None,
                inflight: false,
                dispatched: None,
                cost: edit_cost(&edit),
                bytes,
                bindings: bindings.clone(),
                deleted: deleted.clone(),
                _pins: pins,
                _charge: charge.clone(),
                _slot: slot.ok_or_else(|| status(ErrorCode::Internal))?,
                envelope,
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
                    .get(&Key::Attr(id))
                    .map_or(received, |entry| entry.expires)
            };
            let node = pending.objects.entry(id).or_insert_with(|| Dirty {
                base: base.clone(),
                current: base,
                expires,
                pending: BTreeSet::new(),
                primary: BTreeSet::new(),
                own_tail: None,
                retired: false,
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
            self.bump_key(name_generation(&parent, &name));
            pending
                .names
                .entry(parent)
                .or_default()
                .entry(name.clone())
                .or_default()
                .insert(receipt.id, value);
            let mut cache = self.cache.lock();
            cache.exclude_name(&parent, &name);
            cache.remove(&Key::Name(parent, name.clone()));
        }
        if let Some(edit::Operation::Create(r)) = &edit.operation
            && r.directory
        {
            // A fresh UUID directory starts empty. Keep this deadline through publication; a
            // commit response validates metadata, not the directory's entire membership.
            self.cache.lock().remember_coverage(
                &ListRequest {
                    directory_id: r.object_id,
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
            commit_version: 0,
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
        let expired: Vec<_> = {
            let pending = self.pending.lock();
            let now = Instant::now();
            pending
                .groups
                .values()
                .filter(|group| {
                    !group.inflight
                        && group.buffered_for(now)
                            >= Duration::from_millis(self.config.max_write_delay_ms)
                })
                .map(|group| {
                    let reason = if group.refreshing() {
                        "writeback.expired_refresh"
                    } else if group
                        .dependencies
                        .iter()
                        .any(|receipt| receipt.result.borrow().is_none())
                    {
                        "writeback.expired_dependency"
                    } else {
                        "writeback.expired_ready"
                    };
                    (group.id, reason)
                })
                .collect()
        };
        for (id, reason) in expired {
            self.rpc
                .record("writeback.dispatch_expired", Duration::ZERO, true);
            self.rpc.record(reason, Duration::ZERO, true);
            self.finish(id, Err(ErrorCode::Unavailable));
        }
        {
            let mut pending = self.pending.lock();
            let count = pending.retired.len().min(64);
            for _ in 0..count {
                let Some(id) = pending.retired.pop_front() else {
                    break;
                };
                let Some(node) = pending.objects.get_mut(&id) else {
                    continue;
                };
                if !node.pending.is_empty() {
                    node.retired = false;
                    continue;
                }
                if self
                    .gates
                    .lock()
                    .get(&GateKey::Attr(id))
                    .is_some_and(|g| g.strong_count() > 0)
                {
                    pending.retired.push_back(id);
                } else {
                    pending.objects.remove(&id);
                }
            }
            // Each queued ID retains a charged Dirty node. Limit unused slots to a fixed batch
            // allowance plus four slots per live node, including during shrink reallocation.
            if pending.retired.capacity() > (pending.retired.len() + 64) * 4 {
                pending.retired.shrink_to_fit();
            }
        }
        let mut permit = None;
        let mut failed;
        let mut groups = Vec::new();
        let mut receipts = Vec::new();
        {
            let mut pending = self.pending.lock();
            let (selected, rejected) =
                pending.select(32, self.write_slots.available_permits() == 0);
            failed = rejected;
            for id in selected {
                let Some(group) = pending.groups.get_mut(&id) else {
                    continue;
                };
                let Some(envelope) = group.envelope.take() else {
                    failed.push((id, ErrorCode::Internal));
                    continue;
                };
                // A batch needs one envelope; return the other pre-admission reservations now.
                if permit.is_none() {
                    permit = Some(envelope);
                }
                group.inflight = true;
                let dispatched = Instant::now();
                let dependencies_done = group
                    .dependencies
                    .iter()
                    .filter_map(|d| d.completed.get())
                    .copied()
                    .max()
                    .unwrap_or(group.accepted)
                    .max(group.accepted);
                let eligible = group
                    .forced_at
                    .map_or(group.ready, |t| t.min(group.ready))
                    .max(dependencies_done);
                self.rpc.record(
                    "writeback.ready_queue",
                    dispatched.saturating_duration_since(eligible),
                    false,
                );
                self.rpc.record(
                    "writeback.dependencies",
                    dependencies_done.duration_since(group.accepted),
                    false,
                );
                group.dispatched = Some(dispatched);
                receipts.push(group.receipt.clone());
                groups.push(MutationGroup {
                    id: group.id,
                    edits: group.operations.iter().map(|e| e.rpc.clone()).collect(),
                });
                pending.last_primary = Some(group.primary().into());
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
                let submitted = Instant::now();
                for receipt in &receipts {
                    let _ = receipt.submitted.set(submitted);
                }
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
    /// validity from dispatch time (capped by session expiry), replaying later edits. A delayed
    /// response MUST NOT restart the cache TTL or keep acknowledged edits alive past that deadline.
    /// It MUST NOT renew directory coverage or relabel old blocks with the new revision.
    /// Membership-only parents omitted from the response MUST lose cached attribute validity;
    /// invalidation MUST preserve pending edits and separately confirmed name bindings.
    fn finish(&self, id: u64, result: std::result::Result<Mutation, ErrorCode>) {
        let received = Instant::now();
        let mut pending = self.pending.lock();
        let Some(group) = pending.groups.remove(&id) else {
            return;
        };
        if let Some(started) = group.dispatched {
            self.rpc
                .record("writeback.group", started.elapsed(), result.is_err());
            // Acceptance of the group's first edit to dispatch: the client-only delay.
            self.rpc.record(
                "writeback.client_delay",
                started.saturating_duration_since(group.accepted),
                false,
            );
        }
        // Acceptance to outcome, including groups that fail before dispatch.
        self.rpc.record(
            "writeback.lag",
            received.saturating_duration_since(group.accepted),
            result.is_err(),
        );
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
        if let Ok(mutation) = &result {
            let mut fences = self.fences.lock();
            for id in &group.participants {
                fences.record(*id, mutation.commit_version);
            }
        }
        let sent = group.dispatched.unwrap_or(group.accepted);
        let canonical: HashMap<_, _> = result
            .as_ref()
            .ok()
            .into_iter()
            .flat_map(|m| m.object.iter().chain(&m.related))
            .map(|o| (o.id, o.clone()))
            .collect();
        if let Err(error) = result {
            pending.errors.insert(group.target, error);
            for participant in &group.participants {
                pending.sync_errors.insert(*participant, error);
            }
        }
        for participant in &group.participants {
            self.bump(participant);
            if participant == &group.target || group.deleted.contains(participant) {
                self.bump_primary(participant);
            }
            if result.is_err() || group.deleted.contains(participant) {
                self.cache.lock().remove(&Key::Coverage(*participant));
            }
            self.cache.lock().remove(&Key::Attr(*participant));
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
                        node.expires = self.deadline(sent);
                    } else if group.deleted.contains(participant) {
                        node.base = None;
                        node.expires = self.deadline(sent);
                    } else {
                        node.expires = node.expires.min(received);
                    }
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
                if node.pending.is_empty() && !node.retired {
                    node.retired = true;
                    pending.retired.push_back(*participant);
                }
            }
            if let Some(object) = canonical.get(participant) {
                self.remember_object(object, sent, received);
            } else if result.is_ok() && group.deleted.contains(participant) {
                self.cache.lock().insert(
                    Key::Attr(*participant),
                    Value::Absent,
                    received,
                    self.deadline(sent),
                );
            }
        }
        for (parent, name, value) in &group.bindings {
            self.bump_key(name_generation(parent, name));
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
            self.cache.lock().remove(&Key::Name(*parent, name.clone()));
            if result.is_ok() && pending.binding(parent, name).is_none() {
                self.cache.lock().insert(
                    Key::Name(*parent, name.clone()),
                    Value::Name((*value).into()),
                    received,
                    self.deadline(sent),
                );
            }
        }
        let _ = group.receipt.completed.set(received);
        group.receipt.result.send_replace(Some(result.map(|_| ())));
        drop(group);
        drop(pending);
        self.changed.notify_one();
    }
}

fn buffered_for(accepted: Instant, now: Instant, dependencies: &[Arc<Receipt>]) -> Duration {
    let mut intervals: Vec<_> = dependencies
        .iter()
        .filter_map(|receipt| {
            let start = receipt.submitted.get().copied()?.max(accepted);
            let end = receipt.completed.get().copied().unwrap_or(now).min(now);
            (end > start).then_some((start, end))
        })
        .collect();
    intervals.sort_unstable();
    let mut through = accepted;
    let mut waiting = Duration::ZERO;
    for (start, end) in intervals {
        waiting += end.saturating_duration_since(start.max(through));
        through = through.max(end);
    }
    now.saturating_duration_since(accepted)
        .saturating_sub(waiting)
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
fn new_object(r: &CreateRequest) -> Result<Attr> {
    let now = timestamp()?;
    let object = Attr {
        id: r.object_id,
        directory: r.directory,
        size: 0,
        mode: r.mode,
        atime: Some(now),
        mtime: Some(now),
        ctime: Some(now),
        revision: Revision::default(),
        read_version: 0,
    };
    dfs_protocol::validate::attributes(
        r.mime_type.as_deref().unwrap_or("application/octet-stream"),
        &r.xattrs,
        object.mode,
    )?;
    Ok(object)
}
fn apply_metadata(object: &mut Option<Attr>, id: &ObjectRef, edit: &Edit) -> Result<()> {
    use edit::Operation;
    match edit
        .operation
        .as_ref()
        .ok_or_else(|| status(ErrorCode::InvalidInput))?
    {
        Operation::Create(r) if r.object_id == *id => {
            *object = Some(new_object(r)?);
        }
        Operation::Remove(r) if r.object_id == *id => {
            *object = None;
        }
        Operation::Write(r) if r.object_id == *id => {
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
        Operation::Update(r) if r.object_id == *id => {
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
            if let Some(atime) = r.atime {
                dfs_protocol::validate::timestamp(&atime)?;
                object.atime = Some(atime);
            }
            if let Some(mtime) = r.mtime {
                dfs_protocol::validate::timestamp(&mtime)?;
                object.mtime = Some(mtime);
            }
            if object.mode & !0o7777 != 0 {
                return Err(status(ErrorCode::InvalidInput));
            }
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
    std::mem::size_of::<Edit>()
        + 256
        + match &edit.operation {
            Some(edit::Operation::Write(r)) => r.data.capacity(),
            Some(edit::Operation::Update(r)) => {
                r.mime_type.as_ref().map_or(0, String::capacity)
                    + r.xattrs.capacity() * std::mem::size_of::<XattrChange>()
                    + r.xattrs
                        .iter()
                        .map(|x| x.name.capacity() + x.value.as_ref().map_or(0, Vec::capacity))
                        .sum::<usize>()
            }
            Some(edit::Operation::Create(r)) => {
                r.name.capacity()
                    + r.mime_type.as_ref().map_or(0, String::capacity)
                    + r.xattrs
                        .iter()
                        .map(|(k, v)| k.capacity() + v.capacity() + 128)
                        .sum::<usize>()
            }
            Some(edit::Operation::Rename(r)) => r.name.capacity(),
            _ => 0,
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
fn subtract_base(ranges: &mut BTreeMap<u64, u64>, from: u64, to: u64) {
    if from >= to {
        return;
    }
    while let Some((&start, &end)) = ranges.range(..to).next_back() {
        if end <= from {
            break;
        }
        ranges.remove(&start);
        if start < from {
            ranges.insert(start, from);
        }
        if end > to {
            ranges.insert(to, end);
        }
    }
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
