//! Lease holder table: who may be caching what, and what changed since a read started.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use dfs_proto::{Id, Invalidation};
use parking_lot::Mutex;

use crate::session::Session;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Holdable {
    /// Attributes, content, and symlink target of one object.
    Node(Id),
    /// Every name in a directory (positive or negative) and its listing.
    Dir(Id),
}

const TOUCHED_LIMIT: usize = 1 << 20;

#[derive(Default)]
pub struct Registry {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    seq: u64,
    /// Every holdable counts as touched after a start below `floor`.
    floor: u64,
    touched: HashMap<Holdable, u64>,
    holders: HashMap<Holdable, HashSet<u128>>,
    sessions: HashMap<u128, Arc<Session>>,
}

impl Inner {
    fn fresh(&self, holds: &[Holdable], start: u64) -> bool {
        start >= self.floor && holds.iter().all(|h| self.touched.get(h).is_none_or(|t| *t <= start))
    }

    fn register(&mut self, session: u128, holds: &[Holdable]) {
        for hold in holds {
            self.holders.entry(*hold).or_default().insert(session);
        }
    }
}

fn targets(invalidation: &Invalidation) -> Vec<Holdable> {
    match invalidation {
        Invalidation::Node(id) => vec![Holdable::Node(*id)],
        Invalidation::Name { parent, .. } => vec![Holdable::Dir(*parent), Holdable::Node(*parent)],
        Invalidation::All => Vec::new(),
    }
}

impl Registry {
    pub fn add(&self, session: Arc<Session>) {
        self.inner.lock().sessions.insert(session.id, session);
    }

    pub fn remove(&self, session: u128) {
        let mut inner = self.inner.lock();
        inner.sessions.remove(&session);
        inner.holders.retain(|_, holders| {
            holders.remove(&session);
            !holders.is_empty()
        });
    }

    /// Must be taken before the read version of the operation whose results will be held.
    pub fn start(&self) -> u64 {
        self.inner.lock().seq
    }

    /// @cc [owner:fontanierh,label:concurrency;backend] hold-after-read
    /// Registers `session` as holder of `holds` and returns whether no mutation touched any of
    /// them since `start`. `start` MUST have been taken before the read version of the read that
    /// produced the held state; a `false` result MUST make the reply uncacheable. Together with
    /// `mutate` touching under the same lock, every committed change after the read version is
    /// either reported here or fanned out to this session.
    pub fn hold(&self, session: u128, holds: &[Holdable], start: u64) -> bool {
        let mut inner = self.inner.lock();
        let fresh = inner.fresh(holds, start);
        inner.register(session, holds);
        fresh
    }

    /// Records a committed mutation by `session`: checks and registers what its reply returns
    /// (as `hold`), touches what it changed, and returns the other sessions to invalidate.
    pub fn mutate(
        &self,
        session: u128,
        holds: &[Holdable],
        start: u64,
        invalidations: &[Invalidation],
    ) -> (bool, Vec<(Arc<Session>, Vec<Invalidation>)>) {
        let mut inner = self.inner.lock();
        let fresh = inner.fresh(holds, start);
        inner.register(session, holds);
        inner.seq += 1;
        let seq = inner.seq;
        let mut fanout: HashMap<u128, Vec<Invalidation>> = HashMap::new();
        for invalidation in invalidations {
            if *invalidation == Invalidation::All {
                inner.floor = seq;
                inner.touched.clear();
                for id in inner.sessions.keys().filter(|id| **id != session) {
                    fanout.entry(*id).or_default().push(Invalidation::All);
                }
                continue;
            }
            for target in targets(invalidation) {
                inner.touched.insert(target, seq);
                for holder in inner.holders.get(&target).into_iter().flatten() {
                    let items = fanout.entry(*holder).or_default();
                    if *holder != session && items.last() != Some(invalidation) {
                        items.push(invalidation.clone());
                    }
                }
            }
        }
        if inner.touched.len() > TOUCHED_LIMIT {
            inner.floor = seq;
            inner.touched.clear();
        }
        let sessions = fanout
            .into_iter()
            .filter(|(_, items)| !items.is_empty())
            .filter_map(|(id, items)| inner.sessions.get(&id).map(|s| (s.clone(), items)))
            .collect();
        (fresh, sessions)
    }
}
