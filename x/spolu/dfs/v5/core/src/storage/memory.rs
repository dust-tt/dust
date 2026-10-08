//! Deterministic transactional adapter for core tests. It uses full snapshots for small fixtures.
use super::*;
use parking_lot::Mutex;
#[cfg(test)]
mod tests;

#[derive(Default, Clone)]
pub struct Database(Arc<Mutex<State>>);
#[derive(Default)]
struct State {
    version: i64,
    rows: Rows,
    writes: Vec<(i64, Vec<u8>, Vec<u8>)>,
}
impl Database {
    pub fn snapshot(&self) -> Arc<Snapshot> {
        let state = self.0.lock();
        Snapshot::new(Arc::new(MemoryTransaction {
            database: self.clone(),
            version: state.version,
            rows: state.rows.clone(),
            conflicts: Default::default(),
            mutations: Default::default(),
        }))
    }
}
struct MemoryTransaction {
    database: Database,
    version: i64,
    rows: Rows,
    conflicts: Mutex<Vec<(Vec<u8>, Vec<u8>)>>,
    mutations: Mutex<Vec<Mutation>>,
}
impl MemoryTransaction {
    fn readable(&self, start: &[u8], end: &[u8]) -> Result<(), Status> {
        for mutation in self.mutations.lock().iter() {
            let unreadable = match mutation {
                Mutation::StampedValue(key, _, _) => {
                    key.as_slice() >= start && key.as_slice() < end
                }
                Mutation::StampedKey(key, _, offset) => {
                    let mut lower = key[..*offset].to_vec();
                    lower.extend_from_slice(&self.version.to_be_bytes());
                    let upper = crate::keys::prefix_end(&key[..*offset]);
                    lower.as_slice() < end && upper.as_slice() > start
                }
                _ => false,
            };
            if unreadable {
                return Err(status(ErrorCode::Unavailable));
            }
        }
        Ok(())
    }
    fn current(&self) -> Result<Rows, Status> {
        let mut rows = self.rows.clone();
        for mutation in self.mutations.lock().iter() {
            if !matches!(
                mutation,
                Mutation::StampedKey(..) | Mutation::StampedValue(..)
            ) {
                apply(&mut rows, mutation)?;
            }
        }
        Ok(rows)
    }
}
impl Transaction for MemoryTransaction {
    fn read_version(&self) -> i64 {
        self.version
    }
    fn get<'a>(&'a self, key: &'a [u8]) -> BoxFuture<'a, Result<Option<Bytes>, Status>> {
        Box::pin(async move {
            self.readable(key, &after(key))?;
            Ok(self.current()?.get(key).cloned())
        })
    }
    fn range<'a>(
        &'a self,
        start: &'a [u8],
        end: &'a [u8],
        limit: usize,
    ) -> BoxFuture<'a, Result<(Rows, bool), Status>> {
        Box::pin(async move {
            self.readable(start, end)?;
            self.conflict(start, end)?;
            let current = self.current()?;
            let mut rows: Rows = current
                .range(start.to_vec()..end.to_vec())
                .take(limit + 1)
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            let more = rows.len() > limit;
            if more {
                rows.pop_last();
            }
            Ok((rows, more))
        })
    }
    fn conflict(&self, start: &[u8], end: &[u8]) -> Result<(), Status> {
        let covered = self.mutations.lock().iter().any(|mutation| match mutation {
            Mutation::Put(key, _) | Mutation::Delete(key) => {
                key.as_slice() == start && after(key) == end
            }
            Mutation::Clear(a, b) => a.as_slice() <= start && b.as_slice() >= end,
            Mutation::Increment(_)
            | Mutation::Add(..)
            | Mutation::ByteMax(..)
            | Mutation::StampedKey(..)
            | Mutation::StampedValue(..) => false,
        });
        if !covered {
            self.conflicts.lock().push((start.to_vec(), end.to_vec()));
        }
        Ok(())
    }
    fn mutate(&self, mutation: &Mutation) -> Result<(), Status> {
        mutation.validate(0)?;
        self.mutations.lock().push(mutation.clone());
        Ok(())
    }
    fn commit(self: Arc<Self>) -> BoxFuture<'static, Result<i64, CommitError>> {
        Box::pin(async move {
            let mut state = self.database.0.lock();
            let conflicts = self.conflicts.lock();
            if state.writes.iter().any(|(version, start, end)| {
                *version > self.version && conflicts.iter().any(|(a, b)| start < b && end > a)
            }) {
                return Err(CommitError {
                    code: 1020,
                    definitely_uncommitted: true,
                });
            }
            let mutations = self.mutations.lock();
            let version = state.version + 1;
            let mut stamp = [0; 10];
            stamp[..8].copy_from_slice(&version.to_be_bytes());
            let mutations: Vec<_> = mutations
                .iter()
                .map(|m| match m {
                    Mutation::StampedKey(key, value, offset) => {
                        let mut key = key.clone();
                        key[*offset..*offset + 10].copy_from_slice(&stamp);
                        Mutation::Put(key, value.clone())
                    }
                    Mutation::StampedValue(key, value, offset) => {
                        let mut value = value.to_vec();
                        value[*offset..*offset + 10].copy_from_slice(&stamp);
                        Mutation::Put(key.clone(), value.into())
                    }
                    other => other.clone(),
                })
                .collect();
            if mutations.is_empty() {
                return Ok(-1);
            }
            // Prepare every operation privately so an encoding failure cannot partially publish.
            let mut rows = state.rows.clone();
            for mutation in mutations.iter() {
                apply(&mut rows, mutation).map_err(|_| CommitError {
                    code: 2000,
                    definitely_uncommitted: false,
                })?;
            }
            state.version += 1;
            let version = state.version;
            state.rows = rows;
            for mutation in mutations.iter() {
                let (start, end) = match mutation {
                    Mutation::Put(key, _)
                    | Mutation::Delete(key)
                    | Mutation::Increment(key)
                    | Mutation::Add(key, _)
                    | Mutation::ByteMax(key, _) => (key.clone(), after(key)),
                    Mutation::Clear(start, end) => (start.clone(), end.clone()),
                    Mutation::StampedKey(..) | Mutation::StampedValue(..) => {
                        unreachable!("resolved above")
                    }
                };
                state.writes.push((version, start, end));
            }
            Ok(version)
        })
    }
}
fn apply(rows: &mut Rows, mutation: &Mutation) -> Result<(), Status> {
    match mutation {
        Mutation::Put(key, value) => {
            rows.insert(key.clone(), value.clone());
        }
        Mutation::Delete(key) => {
            rows.remove(key);
        }
        Mutation::Clear(start, end) => rows.retain(|key, _| key < start || key >= end),
        Mutation::ByteMax(key, value) => {
            if rows.get(key).is_none_or(|old| old < value) {
                rows.insert(key.clone(), value.clone());
            }
        }
        Mutation::StampedKey(..) | Mutation::StampedValue(..) => {
            return Err(status(ErrorCode::Unavailable));
        }
        Mutation::Increment(key) | Mutation::Add(key, _) => {
            let old = rows.get(key).map_or(Ok(0i64), |value| {
                <[u8; 8]>::try_from(value.as_ref())
                    .map(i64::from_le_bytes)
                    .map_err(failed)
            })?;
            rows.insert(
                key.clone(),
                Bytes::copy_from_slice(
                    &old.wrapping_add(match mutation {
                        Mutation::Add(_, value) => *value,
                        _ => 1,
                    })
                    .to_le_bytes(),
                ),
            );
        }
    }
    Ok(())
}
