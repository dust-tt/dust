use super::{Entry, FAILED, PENDING};
use crate::{
    keys::{data_owner, prefix_end},
    storage::{Mutation, WriteBatch},
};
use dfs_protocol::{error::status, rpc::ErrorCode};
use std::{
    collections::BTreeMap,
    ops::Bound::{Excluded, Included},
    sync::{Arc, atomic::Ordering},
};
use tonic::Status;

type Order = (u64, usize);
type Versions = BTreeMap<Order, Arc<Entry>>;
type Keys = BTreeMap<Vec<u8>, Versions>;

/// @cc [owner:spolu,label:concurrency;performance] indexed-overlay-history
/// Index every accepted mutation atomically with its journal entry. Resolve only versions at or
/// before the request's cut and newer than its FDB base. Preserve mutation order within a batch.
/// Reads MUST NOT scan unrelated journal entries. Range clears MUST stay within one file's data.
/// Retire index references only when the journal entry can no longer affect any valid snapshot.
#[derive(Default)]
pub(super) struct Index {
    points: Keys,
    clears: Keys,
}
#[derive(Clone)]
pub(super) struct Change {
    pub entry: Arc<Entry>,
    pub position: usize,
}
impl Change {
    pub fn mutation(&self) -> &Mutation {
        &self.entry.batch.0[self.position]
    }
}
// All mutations of a key (and all clears of a file) share a publication participant. Once a
// committed version is already covered by the FDB base, earlier versions are covered too.
fn candidates<'a>(
    versions: &'a Versions,
    cut: u64,
    version: i64,
    examined: &'a mut usize,
) -> impl Iterator<Item = (Order, &'a Arc<Entry>)> + 'a {
    versions
        .range(..=(cut, usize::MAX))
        .rev()
        .inspect(move |_| *examined += 1)
        .filter_map(|(&order, entry)| {
            let outcome = entry.outcome.load(Ordering::Acquire);
            (outcome != FAILED).then_some((order, entry, outcome))
        })
        .take_while(move |(_, _, outcome)| *outcome == PENDING || *outcome > version)
        .map(|(order, entry, _)| (order, entry))
}
impl Index {
    pub fn charge(batch: &WriteBatch) -> Result<usize, Status> {
        let mut bytes = 0;
        for mutation in &batch.0 {
            let key = match mutation {
                Mutation::Put(key, _) | Mutation::Delete(key) => key.as_slice(),
                Mutation::Clear(start, end) => {
                    let owner = data_owner(start).ok_or_else(|| status(ErrorCode::Internal))?;
                    if start >= end || end > &prefix_end(owner) {
                        return Err(status(ErrorCode::Internal));
                    }
                    owner
                }
            };
            bytes += 2 * key.len() + 512;
        }
        Ok(bytes)
    }
    pub fn insert(&mut self, entry: &Arc<Entry>) {
        for (position, mutation) in entry.batch.0.iter().enumerate() {
            let (index, key) = match mutation {
                Mutation::Put(key, _) | Mutation::Delete(key) => (&mut self.points, key.as_slice()),
                Mutation::Clear(start, _) => (&mut self.clears, data_owner(start).unwrap_or(start)),
            };
            index
                .entry(key.to_vec())
                .or_default()
                .insert((entry.seq, position), entry.clone());
        }
    }
    pub fn remove(&mut self, entry: &Entry) {
        for (position, mutation) in entry.batch.0.iter().enumerate() {
            let (index, key) = match mutation {
                Mutation::Put(key, _) | Mutation::Delete(key) => (&mut self.points, key.as_slice()),
                Mutation::Clear(start, _) => (&mut self.clears, data_owner(start).unwrap_or(start)),
            };
            if let Some(versions) = index.get_mut(key) {
                versions.remove(&(entry.seq, position));
                if versions.is_empty() {
                    index.remove(key);
                }
            }
        }
    }
    pub fn point(&self, key: &[u8], cut: u64, version: i64) -> (Option<Change>, usize) {
        let mut examined = 0;
        let point = self.points.get(key).and_then(|versions| {
            candidates(versions, cut, version, &mut examined)
                .next()
                .map(|(order, entry)| {
                    (
                        order,
                        Change {
                            entry: entry.clone(),
                            position: order.1,
                        },
                    )
                })
        });
        let clear = data_owner(key)
            .and_then(|owner| self.clears.get(owner))
            .and_then(|versions| {
                candidates(versions, cut, version, &mut examined).find_map(|(order, entry)| {
                    let Mutation::Clear(start, end) = &entry.batch.0[order.1] else {
                        return None;
                    };
                    (start.as_slice() <= key && key < end.as_slice()).then(|| {
                        (
                            order,
                            Change {
                                entry: entry.clone(),
                                position: order.1,
                            },
                        )
                    })
                })
            });
        let latest = match (point, clear) {
            (Some(a), Some(b)) => Some(if a.0 > b.0 { a } else { b }),
            (a, b) => a.or(b),
        };
        (latest.map(|(_, change)| change), examined)
    }
    pub fn range(&self, start: &[u8], end: &[u8], cut: u64, version: i64) -> Vec<Change> {
        let mut changes = BTreeMap::new();
        let mut examined = 0;
        for versions in self
            .points
            .range::<[u8], _>((Included(start), Excluded(end)))
            .map(|(_, v)| v)
        {
            if let Some((order, entry)) = candidates(versions, cut, version, &mut examined).next() {
                changes.insert(
                    order,
                    Change {
                        entry: entry.clone(),
                        position: order.1,
                    },
                );
            }
        }
        for versions in self
            .clears
            .range::<[u8], _>((Included(data_owner(start).unwrap_or(start)), Excluded(end)))
            .map(|(_, v)| v)
        {
            for (order, entry) in candidates(versions, cut, version, &mut examined) {
                if let Mutation::Clear(a, b) = &entry.batch.0[order.1]
                    && a.as_slice() < end
                    && start < b.as_slice()
                {
                    changes.insert(
                        order,
                        Change {
                            entry: entry.clone(),
                            position: order.1,
                        },
                    );
                }
            }
        }
        changes.into_values().collect()
    }
    pub fn changed_after(&self, start: &[u8], end: &[u8], cut: u64) -> bool {
        if self
            .points
            .range::<[u8], _>((Included(start), Excluded(end)))
            .any(|(_, versions)| {
                versions
                    .range((Excluded((cut, usize::MAX)), std::ops::Bound::Unbounded))
                    .any(|(_, e)| e.outcome.load(Ordering::Acquire) != FAILED)
            })
        {
            return true;
        }
        self.clears
            .range::<[u8], _>((Included(data_owner(start).unwrap_or(start)), Excluded(end)))
            .any(|(_, versions)| {
                versions
                    .range((Excluded((cut, usize::MAX)), std::ops::Bound::Unbounded))
                    .any(|(&(_, position), entry)| {
                        matches!(&entry.batch.0[position], Mutation::Clear(a, b)
                        if a.as_slice() < end && start < b.as_slice())
                            && entry.outcome.load(Ordering::Acquire) != FAILED
                    })
            })
    }
}
