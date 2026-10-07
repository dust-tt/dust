use dfs_protocol::{ObjectRef, rpc::Page};
use std::collections::{BTreeMap, VecDeque};
use tokio::sync::OwnedSemaphorePermit;

const LIMIT: usize = 4096;
pub(super) const MEMORY_BYTES: usize = 2 * 1024 * 1024;

/// @cc [owner:spolu,label:concurrency;performance] bounded-listing-commit-fences
/// A page MUST follow known local commits affecting its directory or returned objects. Unrelated
/// retained commits MUST NOT invalidate it. Forgetting an object's latest version MUST advance a
/// global fallback floor before removing it, including when cache entries/readers were evicted.
/// Commit replies MAY arrive out of order; no fence or fallback floor may move backward.
pub(super) struct Fences {
    latest: BTreeMap<ObjectRef, i64>,
    order: VecDeque<(ObjectRef, i64)>,
    floor: i64,
    _memory: OwnedSemaphorePermit,
}
impl Fences {
    pub fn new(memory: OwnedSemaphorePermit) -> Self {
        Self {
            latest: BTreeMap::new(),
            order: VecDeque::with_capacity(LIMIT),
            floor: 0,
            _memory: memory,
        }
    }
    pub fn record(&mut self, object: ObjectRef, version: i64) {
        if version <= self.floor || self.latest.get(&object).is_some_and(|old| *old >= version) {
            return;
        }
        if self.order.len() == LIMIT
            && let Some((id, previous)) = self.order.pop_front()
            && self.latest.get(&id) == Some(&previous)
        {
            self.floor = self.floor.max(previous);
            self.latest.remove(&id);
        }
        self.latest.insert(object, version);
        self.order.push_back((object, version));
    }
    pub fn accepts(&self, directory: ObjectRef, page: &Page) -> bool {
        let version = page.view.read_version;
        version >= self.floor
            && self
                .latest
                .get(&directory)
                .is_none_or(|floor| version >= *floor)
            && page
                .entries
                .iter()
                .filter_map(|entry| entry.object.as_ref())
                .all(|object| {
                    self.latest
                        .get(&object.id)
                        .is_none_or(|floor| version >= *floor)
                })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dfs_protocol::rpc::{Attr, Entry, ReadView};
    use std::sync::Arc;
    use tokio::sync::Semaphore;

    #[test]
    fn unrelated_commits_do_not_chase_pages_and_eviction_keeps_a_fence() -> anyhow::Result<()> {
        let memory =
            Arc::new(Semaphore::new(MEMORY_BYTES)).try_acquire_many_owned(MEMORY_BYTES as u32)?;
        let mut fences = Fences::new(memory);
        let directory = ObjectRef::new_v4();
        let file = ObjectRef::new_v4();
        let mut page = Page {
            entries: vec![Entry {
                name: "file".into(),
                object: Some(Attr {
                    id: file,
                    ..Default::default()
                }),
            }],
            view: ReadView {
                read_version: 10,
                ..Default::default()
            },
            ..Default::default()
        };
        let unrelated = ObjectRef::new_v4();
        fences.record(unrelated, 30);
        assert!(fences.accepts(directory, &page));
        fences.record(file, 20);
        fences.record(file, 15);
        assert!(!fences.accepts(directory, &page));
        page.view.read_version = 20;
        assert!(fences.accepts(directory, &page));
        for _ in 0..LIMIT {
            fences.record(ObjectRef::new_v4(), 40);
        }
        assert!(fences.order.len() <= LIMIT && fences.latest.len() <= LIMIT);
        assert!(
            !fences.accepts(directory, &page),
            "forgotten commits remain fenced globally"
        );
        page.view.read_version = 40;
        assert!(fences.accepts(directory, &page));
        fences.record(directory, 50);
        assert!(
            !fences.accepts(directory, &page),
            "namespace edits fence absent new entries too"
        );
        Ok(())
    }
}
