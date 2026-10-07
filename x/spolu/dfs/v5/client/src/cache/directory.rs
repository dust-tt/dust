use super::*;
use dfs_protocol::ObjectRef;

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
    /// Expired listed names and child attributes MUST require fresh listing-token validation. Cache checks MUST repeat after waiting for a directory operation.
    /// Pending bindings and generations MUST take precedence over late listing/lookup responses.
    pub(super) async fn lookup(self: &Arc<Self>, r: LookupRequest) -> Result<Attr> {
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
                        directory_id: r.parent_id,
                        after: source.after.clone(),
                        limit: self.config.directory_page_entries,
                    })
                    .await?;
                    refreshed_page = true;
                    continue;
                }
                let object = self.stat(&id).await?;
                self.prefetch_next(&r.parent_id, binding.page.as_ref());
                return Ok(object);
            }
            if !refreshed_page && !r.parent_id.is_virtual() {
                let after = self
                    .cache
                    .lock()
                    .get(&Key::Name(r.parent_id, r.name.clone()))
                    .and_then(|entry| match &entry.value {
                        Value::Name(name) => name.page.as_ref().and_then(|p| p.after.clone()),
                        _ => None,
                    });
                self.page(ListRequest {
                    directory_id: r.parent_id,
                    after,
                    limit: self.config.directory_page_entries,
                })
                .await?;
                refreshed_page = true;
                continue;
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
            let name_gate = self.gate_key(name_generation(&r.parent_id, &r.name))?;
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
                            Key::Name(r.parent_id, r.name.clone()),
                            Value::Name(Some(object.id).into()),
                            received,
                            self.deadline(started),
                        );
                    }
                    Err(e) if code(e) == ErrorCode::NotFound => self.cache.lock().insert(
                        Key::Name(r.parent_id, r.name.clone()),
                        Value::Name(None.into()),
                        received,
                        self.deadline(started),
                    ),
                    _ => (),
                }
                drop(pending);
                drop(guard);
                if result.is_ok() {
                    self.prefetch(ListRequest {
                        directory_id: r.parent_id,
                        after: None,
                        limit: self.config.directory_page_entries,
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
        if r.limit != self.config.directory_page_entries {
            return None;
        }
        self.cache
            .lock()
            .get(&Key::Page(r.directory_id, r.after.clone()))
    }
    fn cached_page_for(&self, request: &ListRequest) -> (ListRequest, Option<Arc<memory::Entry>>) {
        let mut source = request.clone();
        if request.limit != self.config.directory_page_entries {
            return (source, None);
        }
        let mut cache = self.cache.lock();
        if let Some(start) = cache.page_start(request) {
            source.after = start;
        }
        let entry = cache.get(&Key::Page(source.directory_id, source.after.clone()));
        (source, entry)
    }

    /// @cc [owner:spolu,label:security;concurrency] independently-validated-pages
    /// Reusing expired pages MUST require Validate to confirm the entire listing and its authority.
    /// Every returned name and child attribute MUST share that validating send-time deadline.
    /// Local generations MUST fence responses. Expired virtual projections MUST refresh by listing.
    /// Projection MUST share the pending-state lock with validation, so publication cannot retire
    /// an overlay between accepting a server snapshot and applying acknowledged namespace edits.
    async fn page(&self, r: ListRequest) -> Result<Page> {
        self.active()?;
        if !(1..=dfs_protocol::MAX_LIST).contains(&r.limit) {
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
        let directory = if r.directory_id == ObjectRef::Root {
            self.root
        } else {
            r.directory_id
        };
        let wait = self.rpc.measure("wait.object_gate");
        let _guard = gate.mutex.lock().await;
        drop(wait);
        for _ in 0..4 {
            self.active()?;
            let generation = gate.generation.load(Ordering::Acquire);
            let started = Instant::now();
            let (mut source, cached) = self.cached_page_for(&r);
            if let Some(entry) = &cached
                && Instant::now() < entry.expires
                && let Value::Page(page) = &entry.value
            {
                let pending = self.pending.lock();
                if gate.generation.load(Ordering::Acquire) == generation
                    && self.fences.lock().accepts(directory, page)
                {
                    return Ok(pending.overlay_page(&r, page_suffix(&r, page)));
                }
            }
            let reused = if let Some(entry) = &cached
                && let Value::Page(page) = &entry.value
                && !page.listing_token.is_empty()
                && !self.pending.lock().contains(&r.directory_id)
            {
                self.refresh_page(&r.directory_id, page).await?
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
                    source = r.clone();
                    let page = self.rpc.list(r.clone()).await?;
                    let received = Instant::now();
                    (page, received, self.deadline(started))
                }
            };
            self.active()?;
            {
                let pending = self.pending.lock();
                // Fences survive attribute eviction. Unrelated current commits do not force an
                // otherwise coherent directory snapshot to chase a moving mount-wide version.
                if gate.generation.load(Ordering::Acquire) == generation
                    && !self.fences.lock().accepts(directory, &page)
                {
                    self.rpc
                        .record("cache.page_version_retry", Duration::ZERO, false);
                    continue;
                }
                if gate.generation.load(Ordering::Acquire) == generation {
                    self.remember_page(&source, &page, started, received, expires, &pending);
                    return Ok(pending.overlay_page(&r, owned_page_suffix(&r, page)));
                }
            }
            self.rpc.record("cache.page_raced", Duration::ZERO, false);
            self.stabilize_directory(&r.directory_id).await?;
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
            revision: page.listing_token.clone(),
        };
        for entry in &page.entries {
            if let Some(object) = &entry.object {
                self.remember_object(object, started, received);
                self.cache.lock().insert(
                    Key::Source(object.id),
                    Value::Source {
                        parent: r.directory_id,
                        after: r.after.clone(),
                    },
                    received,
                    expires,
                );
                self.cache.lock().insert(
                    Key::Name(r.directory_id, entry.name.clone()),
                    Value::Name(Name {
                        object_id: Some(object.id),
                        page: Some(source.clone()),
                    }),
                    received,
                    expires,
                );
            }
        }
        let mut cache = self.cache.lock();
        if r.limit == self.config.directory_page_entries {
            cache.insert(
                Key::Page(r.directory_id, r.after.clone()),
                Value::Page(page.clone()),
                received,
                expires,
            );
        }
        cache.remember_coverage(r, page, pending.names(&r.directory_id), received, expires);
    }

    async fn refresh_page(
        &self,
        id: &ObjectRef,
        old: &Page,
    ) -> Result<Option<(Page, Instant, Instant)>> {
        let started = Instant::now();
        let response = self
            .rpc
            .validate(ValidateRequest {
                checks: vec![ValidationCheck {
                    check: Some(validation_check::Check::Directory(DirectoryCheck {
                        object_id: *id,
                        listing_token: old.listing_token.clone(),
                    })),
                }],
            })
            .await?;
        if response.results.len() != 1 {
            return Err(status(ErrorCode::Unavailable));
        }
        if response.results[0].outcome != ValidationOutcome::Unchanged as i32 {
            return Ok(None);
        }
        let mut page = old.clone();
        page.view = response.view;
        let received = Instant::now();
        let expires = self.deadline(started);
        if received >= expires {
            return Ok(None);
        }
        Ok(Some((page, received, expires)))
    }

    fn prefetch_next(self: &Arc<Self>, parent: &ObjectRef, source: Option<&PageSource>) {
        let Some(source) = source else {
            return;
        };
        let next = self
            .cache
            .lock()
            .get(&Key::Page(parent.into(), source.after.clone()))
            .and_then(|entry| match &entry.value {
                Value::Page(page) if page.listing_token == source.revision => {
                    page.next_after.clone()
                }
                _ => None,
            });
        if let Some(after) = next {
            self.prefetch(ListRequest {
                directory_id: parent.into(),
                after: Some(after),
                limit: self.config.directory_page_entries,
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
        self.runtime.spawn(async move {
            let _permit = permit;
            let Ok(_memory) = inner.temporary_memory(OPERATION_BYTES).await else {
                return;
            };
            let _ = inner.page(request).await;
        });
    }
}

fn page_suffix(request: &ListRequest, page: &Page) -> Page {
    if request.directory_id == ObjectRef::Shared {
        return page.clone();
    }
    Page {
        entries: page
            .entries
            .iter()
            .filter(|entry| {
                request
                    .after
                    .as_ref()
                    .is_none_or(|after| entry.name > *after)
            })
            .cloned()
            .collect(),
        next_after: page.next_after.clone(),
        listing_token: page.listing_token.clone(),
        view: page.view.clone(),
    }
}

fn owned_page_suffix(request: &ListRequest, mut page: Page) -> Page {
    if request.directory_id != ObjectRef::Shared
        && let Some(after) = &request.after
    {
        page.entries.retain(|entry| entry.name > *after);
    }
    page
}
