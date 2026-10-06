use super::*;

impl Inner {
    fn binding(&self, r: &LookupRequest) -> Option<Name> {
        let pending = self.pending.lock();
        if let Some(id) = pending.binding(&r.parent_id, &r.name) {
            return Some(id.into());
        }
        let mut cache = self.cache.lock();
        cache.binding(&r.parent_id, &r.name).or_else(|| {
            if cache.absent(&r.parent_id, &r.name) {
                self.rpc
                    .record("cache.lookup_absent", Duration::ZERO, false);
                Some(None.into())
            } else {
                None
            }
        })
    }

    /// @cc [owner:spolu,label:performance;security] retained-name-resolution
    /// Expired listed names MUST require fresh matching directory authority. Child attributes MUST
    /// refresh independently. Cache checks MUST repeat after waiting for a directory operation.
    /// Pending bindings and generations MUST take precedence over late listing/lookup responses.
    pub(super) async fn lookup(self: &Arc<Self>, r: LookupRequest) -> Result<Object> {
        self.active()?;
        dfs_protocol::validate::name(&r.name)?;
        let mut refreshed_page = false;
        for _ in 0..4 {
            if let Some(binding) = self.binding(&r) {
                let id = binding
                    .object_id
                    .ok_or_else(|| status(ErrorCode::NotFound))?;
                // Refresh expired sibling attributes together without re-listing stable membership.
                if self.cached_object(&id).is_none()
                    && !refreshed_page
                    && let Some(source) = &binding.page
                {
                    self.page(ListRequest {
                        directory_id: r.parent_id.clone(),
                        after: source.after.clone(),
                        limit: 64,
                    })
                    .await?;
                    refreshed_page = true;
                    continue;
                }
                let object = self.stat(&id).await?;
                self.prefetch_next(&r.parent_id, binding.page.as_ref());
                return Ok(object);
            }
            let gate = self.gate(&r.parent_id)?;
            let wait = self.rpc.measure("wait.object_gate");
            let guard = gate.mutex.lock().await;
            drop(wait);
            self.active()?;
            if self.binding(&r).is_some() {
                drop(guard);
                continue;
            }
            let retained = self
                .cache
                .lock()
                .get(&Key::Name(r.parent_id.clone(), r.name.clone()))
                .is_some_and(|entry| {
                    matches!(&entry.value, Value::Name(name)
                    if name.page.as_ref().is_some_and(|p| !p.revision.is_empty()))
                });
            if retained && !self.pending.lock().contains(&r.parent_id) {
                self.stat_locked(&r.parent_id, &gate).await?;
                if self.binding(&r).is_some() {
                    drop(guard);
                    continue;
                }
            }
            let name_gate = self.gate(&name_generation(&r.parent_id, &r.name))?;
            for _ in 0..4 {
                let generation = name_gate.generation.load(Ordering::Acquire);
                let started = Instant::now();
                let result = self.rpc.lookup(r.clone()).await;
                let received = Instant::now();
                self.active()?;
                let pending = self.pending.lock();
                if name_gate.generation.load(Ordering::Acquire) != generation {
                    continue;
                }
                match &result {
                    Ok(object) => {
                        self.remember_object(object, started, received);
                        self.cache.lock().insert(
                            Key::Name(r.parent_id.clone(), r.name.clone()),
                            Value::Name(Some(object.id.clone()).into()),
                            received,
                            self.deadline(received),
                        );
                    }
                    Err(e) if code(e) == ErrorCode::NotFound => self.cache.lock().insert(
                        Key::Name(r.parent_id.clone(), r.name.clone()),
                        Value::Name(None.into()),
                        received,
                        self.deadline(received),
                    ),
                    _ => (),
                }
                drop(pending);
                drop(guard);
                if result.is_ok() {
                    self.prefetch(ListRequest {
                        directory_id: r.parent_id,
                        after: None,
                        limit: 64,
                    });
                }
                return result;
            }
            return Err(status(ErrorCode::Unavailable));
        }
        Err(status(ErrorCode::Unavailable))
    }

    pub(super) async fn list(self: &Arc<Self>, r: ListRequest) -> Result<Page> {
        let page = self.page(r.clone()).await?;
        if let Some(after) = page.next_after.clone() {
            self.prefetch(ListRequest {
                after: Some(after),
                ..r
            });
        }
        Ok(page)
    }

    fn cached_page(&self, r: &ListRequest) -> Option<Arc<memory::Entry>> {
        if r.limit != 64 {
            return None;
        }
        self.cache
            .lock()
            .get(&Key::Page(r.directory_id.clone(), r.after.clone()))
    }

    /// @cc [owner:spolu,label:security;concurrency] independently-validated-pages
    /// Reusing expired membership MUST require the page's snapshot revision to match fresh canonical
    /// directory authority. Every returned child attribute MUST retain its own validating deadline.
    /// Local generations MUST fence responses. Expired virtual projections MUST refresh by listing.
    /// Projection MUST share the pending-state lock with validation, so publication cannot retire
    /// an overlay between accepting a server snapshot and applying acknowledged namespace edits.
    async fn page(&self, r: ListRequest) -> Result<Page> {
        self.active()?;
        if !(1..=64).contains(&r.limit) {
            return Err(status(ErrorCode::InvalidInput));
        }
        if self.pending.lock().local_directory(&r.directory_id) {
            self.stat(&r.directory_id).await?;
            let pending = self.pending.lock();
            if pending.local_directory(&r.directory_id) {
                return Ok(pending.overlay_page(&r, Page::default()));
            }
        }
        let gate = self.gate(&r.directory_id)?;
        let wait = self.rpc.measure("wait.object_gate");
        let _guard = gate.mutex.lock().await;
        drop(wait);
        let mut refresh = None;
        for _ in 0..4 {
            self.active()?;
            let generation = gate.generation.load(Ordering::Acquire);
            let started = Instant::now();
            let cached = self.cached_page(&r);
            if let Some(entry) = &cached
                && Instant::now() < entry.expires
                && let Value::Page(page) = &entry.value
            {
                let pending = self.pending.lock();
                if gate.generation.load(Ordering::Acquire) == generation {
                    return Ok(pending.overlay_page(&r, page.clone()));
                }
            }
            let reused = if let Some(entry) = &cached
                && let Value::Page(page) = &entry.value
                && !page.directory_revision.is_empty()
                && !self.pending.lock().contains(&r.directory_id)
            {
                self.stat_locked(&r.directory_id, &gate).await?;
                let expires = self
                    .cache
                    .lock()
                    .membership_deadline(&r.directory_id, &page.directory_revision);
                match expires {
                    Some(expires) => self.refresh_page(page, expires).await?,
                    None => None,
                }
            } else {
                None
            };
            let (page, received, expires) = match reused {
                Some(page) => {
                    self.rpc
                        .record("cache.page_revalidated", Duration::ZERO, false);
                    page
                }
                None => {
                    let page = self.rpc.list(r.clone()).await?;
                    let received = Instant::now();
                    (page, received, self.deadline(received))
                }
            };
            self.active()?;
            {
                let pending = self.pending.lock();
                if gate.generation.load(Ordering::Acquire) == generation {
                    self.remember_page(&r, &page, started, received, expires, &pending);
                    return Ok(pending.overlay_page(&r, page));
                }
            }
            self.rpc.record("cache.page_raced", Duration::ZERO, false);
            if refresh.is_none() {
                refresh = Some(
                    self.stabilize_directory(&r.directory_id, gate.clone())
                        .await?,
                );
            }
        }
        self.rpc
            .record("cache.page_retry_exhausted", Duration::ZERO, true);
        Err(status(ErrorCode::Unavailable))
    }

    fn remember_page(
        &self,
        r: &ListRequest,
        page: &Page,
        started: Instant,
        received: Instant,
        expires: Instant,
        pending: &writeback::Pending,
    ) {
        let source = PageSource {
            after: r.after.clone(),
            revision: page.directory_revision.clone(),
        };
        for entry in &page.entries {
            if let Some(object) = &entry.object {
                self.remember_object(object, started, received);
                self.cache.lock().insert(
                    Key::Name(r.directory_id.clone(), entry.name.clone()),
                    Value::Name(Name {
                        object_id: Some(object.id.clone()),
                        page: Some(source.clone()),
                    }),
                    received,
                    expires,
                );
            }
        }
        let mut cache = self.cache.lock();
        if r.limit == 64 {
            cache.insert(
                Key::Page(r.directory_id.clone(), r.after.clone()),
                Value::Page(page.clone()),
                received,
                expires,
            );
        }
        cache.remember_coverage(r, page, pending.names(&r.directory_id), received, expires);
    }

    async fn refresh_page(
        &self,
        old: &Page,
        membership_expires: Instant,
    ) -> Result<Option<(Page, Instant, Instant)>> {
        let mut page = old.clone();
        let mut received = None;
        // Sixteen maximum-sized metadata records fit the existing bounded gRPC response.
        for entries in page.entries.chunks_mut(16) {
            let ids = entries
                .iter()
                .map(|entry| entry.object.as_ref().map(|o| o.id.clone()))
                .collect::<Option<Vec<_>>>();
            let Some(object_ids) = ids else {
                return Ok(None);
            };
            let response = self.rpc.stat_many(StatManyRequest { object_ids }).await?;
            received.get_or_insert_with(Instant::now);
            if response.results.len() != entries.len() {
                return Err(status(ErrorCode::Unavailable));
            }
            for (entry, result) in entries.iter_mut().zip(response.results) {
                if let Some(error) = result.error {
                    let code = ErrorCode::try_from(error.code).unwrap_or(ErrorCode::Internal);
                    if code == ErrorCode::NotFound {
                        return Ok(None);
                    }
                    return Err(status(code));
                }
                let object = result
                    .object
                    .ok_or_else(|| status(ErrorCode::Unavailable))?;
                if entry.object.as_ref().is_none_or(|old| old.id != object.id)
                    || result.object_id != object.id
                {
                    return Err(status(ErrorCode::Unavailable));
                }
                entry.object = Some(object);
            }
        }
        // Growing xattrs can make the old range exceed the page byte budget. Re-list to repaginate.
        if page
            .entries
            .iter()
            .map(|entry| entry.name.len() + entry.object.as_ref().map_or(0, memory::object_weight))
            .sum::<usize>()
            > MAX_IO
        {
            return Ok(None);
        }
        let received = received.unwrap_or_else(Instant::now);
        let expires = self.deadline(received).min(membership_expires);
        if Instant::now() >= expires {
            return Ok(None);
        }
        Ok(Some((page, received, expires)))
    }

    fn prefetch_next(self: &Arc<Self>, parent: &str, source: Option<&PageSource>) {
        let Some(source) = source else {
            return;
        };
        let next = self
            .cache
            .lock()
            .get(&Key::Page(parent.into(), source.after.clone()))
            .and_then(|entry| match &entry.value {
                Value::Page(page) if page.directory_revision == source.revision => {
                    page.next_after.clone()
                }
                _ => None,
            });
        if let Some(after) = next {
            self.prefetch(ListRequest {
                directory_id: parent.into(),
                after: Some(after),
                limit: 64,
            });
        }
    }

    /// @cc [owner:spolu,label:performance] demand-driven-page-ahead
    /// Only application access MAY advance prefetch by one page. Completion MUST NOT chain further
    /// requests. Prefetch MUST share the memory budget and the two-request concurrency bound.
    /// Server cursors MUST be preserved, including shared ID cursors. Hits MUST NOT renew TTLs.
    fn prefetch(self: &Arc<Self>, request: ListRequest) {
        if self
            .cached_page(&request)
            .is_some_and(|entry| Instant::now() < entry.expires)
        {
            return;
        }
        let Ok(permit) = self.prefetch.clone().try_acquire_owned() else {
            return;
        };
        let inner = self.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let _ = inner.page(request).await;
        });
    }
}
