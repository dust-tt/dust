use crate::keys::Keys;
use dfs_protocol::validate;
use std::collections::{HashMap, HashSet, VecDeque};
use tokio::sync::Mutex;

pub(crate) const WINDOW: usize = 16;
const MAX_ENTRIES: usize = 16_384;
const MAX_BYTES: usize = 8 * 1024 * 1024;

/// @cc [owner:spolu,label:security;performance] advisory-parent-edges
/// Store only workspace-scoped directory/parent IDs, never grants or authorization decisions.
/// Hints MAY be stale or originate from aborted transactions. Consumers MUST read and validate all
/// used parent links and grants in their current FDB transaction. Cache misses MUST preserve access.
/// The cache MUST bound total entries/bytes across workspaces and each returned chain's length.
#[derive(Default)]
pub(crate) struct Ancestry(Mutex<Edges>);

#[derive(Default)]
struct Edges {
    parents: HashMap<Vec<u8>, String>,
    order: VecDeque<Vec<u8>>,
    bytes: usize,
}
impl Ancestry {
    pub async fn remember(&self, keys: &Keys, directory: &str, parent: &str) {
        let (Ok(key), Ok(parent)) = (keys.object(directory), validate::id(parent)) else {
            return;
        };
        self.0.lock().await.insert(key, parent);
    }

    pub async fn chain(&self, keys: &Keys, first: &str) -> Vec<String> {
        let edges = self.0.lock().await;
        let mut chain = Vec::new();
        let mut seen = HashSet::new();
        let mut next = first.to_owned();
        while chain.len() < WINDOW - 1 && seen.insert(next.clone()) {
            let Ok(key) = keys.object(&next) else {
                break;
            };
            chain.push(next);
            let Some(parent) = edges.parents.get(&key) else {
                break;
            };
            next = parent.clone();
        }
        chain
    }
}
impl Edges {
    fn charge(key: &[u8], parent: &str) -> usize {
        // Include both key copies, the parent, and conservative container/allocation overhead.
        2 * key.len() + parent.len() + 128
    }
    fn insert(&mut self, key: Vec<u8>, parent: String) {
        if let Some(previous) = self.parents.get_mut(&key) {
            *previous = parent;
            return;
        }
        let charge = Self::charge(&key, &parent);
        while self.parents.len() >= MAX_ENTRIES || self.bytes + charge > MAX_BYTES {
            let Some(oldest) = self.order.pop_front() else {
                return;
            };
            if let Some(previous) = self.parents.remove(&oldest) {
                self.bytes -= Self::charge(&oldest, &previous);
            }
        }
        self.bytes += charge;
        self.order.push_back(key.clone());
        self.parents.insert(key, parent);
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    #[tokio::test]
    async fn hints_are_scoped_bounded_and_tolerate_cycles() -> anyhow::Result<()> {
        let hints = Ancestry::default();
        let keys = Keys::new("a")?;
        let other = Keys::new("b")?;
        let a = "01".repeat(16);
        let b = "02".repeat(16);
        hints.remember(&keys, &a, &b).await;
        hints.remember(&keys, &b, &a).await;
        assert_eq!(hints.chain(&keys, &a).await, [a.clone(), b.clone()]);
        assert_eq!(hints.chain(&other, &a).await, [a]);
        for i in 0..MAX_ENTRIES + 1 {
            hints.remember(&keys, &format!("{i:032x}"), &b).await;
        }
        let edges = hints.0.lock().await;
        assert!(edges.parents.len() <= MAX_ENTRIES);
        assert_eq!(edges.parents.len(), edges.order.len());
        assert!(edges.bytes <= MAX_BYTES);
        Ok(())
    }

    pub(crate) async fn concurrent_changes_abort_prefetched_writes() -> anyhow::Result<()> {
        use crate::{
            model::{self, Parent, Record, WorkspaceRecord},
            mutation::Edit,
            read::View,
            storage::{Storage, StorageConfig, WriteBatch, encode},
        };
        use anyhow::Context;
        use dfs_protocol::{
            error::code,
            rpc::{ErrorCode, WriteRequest},
        };
        use std::{
            collections::BTreeSet,
            sync::{
                Arc,
                atomic::{AtomicBool, Ordering},
            },
        };
        use tokio::sync::Notify;

        let store = Storage::open(&StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-hints-{}", uuid::Uuid::new_v4().simple()),
        })
        .await?;
        let keys = Keys::new("test")?;
        let root = Record {
            object: model::new_object(true, 0o755)?,
            parent: None,
        };
        let directory = |parent: &Record, name: &str| -> anyhow::Result<Record> {
            Ok(Record {
                object: model::new_object(true, 0o755)?,
                parent: Some(Parent {
                    id: parent.object.id.clone(),
                    name: name.into(),
                }),
            })
        };
        let allowed = directory(&root, "allowed")?;
        let forbidden = directory(&root, "forbidden")?;
        let moved = directory(&allowed, "moved")?;
        let file = Record {
            object: model::new_object(false, 0o600)?,
            parent: Some(Parent {
                id: moved.object.id.clone(),
                name: "file".into(),
            }),
        };
        let hints = Arc::new(Ancestry::default());
        // Change a grant, an ancestor link, or the prefetched object after preparation.
        for change_kind in 0..3 {
            store
                .transact(|_| async {
                    let mut edit = Edit::new();
                    edit.put(
                        keys.workspace(),
                        encode(&WorkspaceRecord {
                            root: root.object.id.clone(),
                            key_hash: [0; 32],
                        })?,
                    )?;
                    for record in [&root, &allowed, &forbidden, &moved, &file] {
                        edit.record(&keys, record)?;
                    }
                    edit.grant(&keys, &allowed.object.id, "reader", true)?;
                    Ok((edit.batch, ()))
                })
                .await?;
            let view = View::new(&store, "test", BTreeSet::from(["reader".into()]))
                .await?
                .with_ancestry(hints.clone());
            view.stat(&file.object.id).await?;
            drop(view);
            let prepared = Notify::new();
            let changed = Notify::new();
            let first = AtomicBool::new(true);
            let write = store.transact(|snapshot| async {
                let view = View::prefetch(
                    snapshot,
                    "test",
                    BTreeSet::from(["reader".into()]),
                    &file.object.id,
                )
                .await?
                .with_ancestry(hints.clone());
                let (edit, response) = view
                    .write(WriteRequest {
                        object_id: file.object.id.clone(),
                        expected_version: file.object.version,
                        data: b"must not commit".to_vec(),
                        ..Default::default()
                    })
                    .await?;
                if first.swap(false, Ordering::Relaxed) {
                    prepared.notify_one();
                    changed.notified().await;
                }
                Ok((edit.batch, response))
            });
            let invalidate = async {
                prepared.notified().await;
                // A different transaction changes a dependency without touching this hints cache.
                let result = store
                    .transact(|_| async {
                        let mut edit = Edit::new();
                        if change_kind == 1 {
                            let mut moved = moved.clone();
                            moved.parent = Some(Parent {
                                id: forbidden.object.id.clone(),
                                name: "moved".into(),
                            });
                            moved.object = model::bumped(moved.object, false)?;
                            edit.record(&keys, &moved)?;
                        } else if change_kind == 0 {
                            edit.grant(&keys, &allowed.object.id, "reader", false)?;
                        } else {
                            let mut file = file.clone();
                            file.object = model::bumped(file.object, true)?;
                            file.object.size = 4;
                            edit.record(&keys, &file)?;
                            edit.put(keys.block(&file.object.id, 0)?, b"kept".to_vec())?;
                        }
                        Ok((edit.batch, ()))
                    })
                    .await;
                changed.notify_one();
                result
            };
            let (write, change) = tokio::time::timeout(std::time::Duration::from_secs(15), async {
                tokio::join!(write, invalidate)
            })
            .await?;
            change?;
            assert_eq!(
                code(
                    &write
                        .err()
                        .context("concurrent authority change was ignored")?
                ),
                if change_kind == 2 {
                    ErrorCode::VersionConflict
                } else {
                    ErrorCode::NotFound
                }
            );
            let data = store.get(keys.block(&file.object.id, 0)?).await?;
            assert_eq!(
                data.as_deref(),
                (change_kind == 2).then_some(b"kept".as_slice())
            );
        }
        store
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    }
}
