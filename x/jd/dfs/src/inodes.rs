use crate::model::*;
use parking_lot::Mutex;
use std::{collections::HashMap, sync::Arc};

#[derive(Clone, Copy)]
pub enum ReferenceKind {
    Open,
    Work,
    Notification,
    Directory,
}

struct Record {
    id: Option<Id>,
    lookups: u64,
    references: [u64; 4],
}

struct State {
    active: HashMap<Id, u64>,
    records: HashMap<u64, Record>,
    next: u64,
    capacity: usize,
    reclaimed: u64,
}

impl State {
    fn reclaim(&mut self, ino: u64) {
        if ino <= 3
            || self.records.get(&ino).is_none_or(|record| {
                record.lookups != 0 || record.references.iter().any(|count| *count != 0)
            })
        {
            return;
        }
        if let Some(record) = self.records.remove(&ino) {
            if let Some(id) = record.id
                && self.active.get(&id) == Some(&ino)
            {
                self.active.remove(&id);
            }
            self.reclaimed += 1;
        }
    }
}

#[derive(Clone)]
pub struct Inodes {
    state: Arc<Mutex<State>>,
}

pub struct InodePin {
    inodes: Inodes,
    ino: u64,
    kind: ReferenceKind,
}

impl InodePin {
    pub fn ino(&self) -> u64 {
        self.ino
    }
}

impl Clone for InodePin {
    fn clone(&self) -> Self {
        self.inodes
            .state
            .lock()
            .records
            .get_mut(&self.ino)
            .unwrap()
            .references[self.kind as usize] += 1;
        Self {
            inodes: self.inodes.clone(),
            ino: self.ino,
            kind: self.kind,
        }
    }
}

impl Drop for InodePin {
    fn drop(&mut self) {
        let mut state = self.inodes.state.lock();
        if let Some(record) = state.records.get_mut(&self.ino) {
            record.references[self.kind as usize] -= 1;
            state.reclaim(self.ino);
        }
    }
}

impl Inodes {
    pub fn check_capacity(&self) -> Result<()> {
        let state = self.state.lock();
        if state.records.len() >= state.capacity {
            return Err(err(libc::ENFILE, "inode capacity"));
        }
        Ok(())
    }

    pub fn new(capacity: usize, root: Option<Id>) -> Result<Self> {
        if capacity < 3 {
            return Err(err(libc::EINVAL, "inode capacity must include three roots"));
        }
        let mut active = HashMap::new();
        if let Some(root) = &root {
            active.insert(root.clone(), 3);
        }
        let records = (1..=3)
            .map(|ino| {
                (
                    ino,
                    Record {
                        id: if ino == 3 { root.clone() } else { None },
                        lookups: 0,
                        references: [0; 4],
                    },
                )
            })
            .collect();
        Ok(Self {
            state: Arc::new(Mutex::new(State {
                active,
                records,
                next: 4,
                capacity,
                reclaimed: 0,
            })),
        })
    }

    pub fn allocate(&self, id: &str, kind: ReferenceKind) -> Result<InodePin> {
        let mut state = self.state.lock();
        let ino = if let Some(ino) = state.active.get(id) {
            *ino
        } else {
            if state.records.len() >= state.capacity {
                return Err(err(libc::ENFILE, "inode capacity"));
            }
            let ino = state.next;
            state.next = state
                .next
                .checked_add(1)
                .ok_or_else(|| err(libc::EOVERFLOW, "inode identity exhausted"))?;
            state.records.insert(
                ino,
                Record {
                    id: Some(id.into()),
                    lookups: 0,
                    references: [0; 4],
                },
            );
            state.active.insert(id.into(), ino);
            ino
        };
        state.records.get_mut(&ino).unwrap().references[kind as usize] += 1;
        Ok(InodePin {
            inodes: self.clone(),
            ino,
            kind,
        })
    }

    pub fn pin(&self, ino: u64, kind: ReferenceKind) -> Result<InodePin> {
        let mut state = self.state.lock();
        let record = state
            .records
            .get_mut(&ino)
            .ok_or_else(|| err(libc::ESTALE, "inode absent"))?;
        record.references[kind as usize] += 1;
        Ok(InodePin {
            inodes: self.clone(),
            ino,
            kind,
        })
    }

    pub fn pin_active(&self, id: &str, kind: ReferenceKind) -> Option<InodePin> {
        let mut state = self.state.lock();
        let ino = *state.active.get(id)?;
        state.records.get_mut(&ino)?.references[kind as usize] += 1;
        Some(InodePin {
            inodes: self.clone(),
            ino,
            kind,
        })
    }

    pub fn pin_kernel(&self, id: &str) -> Option<InodePin> {
        let mut state = self.state.lock();
        let ino = *state.active.get(id)?;
        let record = state.records.get_mut(&ino)?;
        if record.lookups == 0 && record.references[ReferenceKind::Open as usize] == 0 {
            return None;
        }
        record.references[ReferenceKind::Notification as usize] += 1;
        Some(InodePin {
            inodes: self.clone(),
            ino,
            kind: ReferenceKind::Notification,
        })
    }

    pub fn pin_all(&self, kind: ReferenceKind) -> Vec<InodePin> {
        self.state
            .lock()
            .records
            .iter_mut()
            .map(|(ino, record)| {
                record.references[kind as usize] += 1;
                InodePin {
                    inodes: self.clone(),
                    ino: *ino,
                    kind,
                }
            })
            .collect()
    }

    pub fn id(&self, ino: u64) -> Option<Id> {
        self.state.lock().records.get(&ino)?.id.clone()
    }
    pub fn is_active(&self, ino: u64, id: &str) -> bool {
        self.state.lock().active.get(id) == Some(&ino)
    }
    pub fn active_ids(&self) -> Vec<Id> {
        self.state.lock().active.keys().cloned().collect()
    }
    pub fn retain_active(&self, keep: impl Fn(&str) -> bool) {
        self.state.lock().active.retain(|id, _| keep(id));
    }

    pub fn retire(&self, id: &str) -> Option<InodePin> {
        let mut state = self.state.lock();
        let ino = *state.active.get(id)?;
        if ino <= 3 {
            return None;
        }
        state.active.remove(id);
        state.records.get_mut(&ino)?.references[ReferenceKind::Notification as usize] += 1;
        Some(InodePin {
            inodes: self.clone(),
            ino,
            kind: ReferenceKind::Notification,
        })
    }

    pub fn add_lookup(&self, ino: u64) -> Result<()> {
        if ino <= 3 {
            return Ok(());
        }
        let mut state = self.state.lock();
        let record = state
            .records
            .get_mut(&ino)
            .ok_or_else(|| err(libc::ESTALE, "inode absent"))?;
        record.lookups = record
            .lookups
            .checked_add(1)
            .ok_or_else(|| err(libc::EOVERFLOW, "inode lookup count"))?;
        Ok(())
    }

    pub fn forget(&self, ino: u64, count: u64) {
        let mut state = self.state.lock();
        if let Some(record) = state.records.get_mut(&ino) {
            record.lookups = record.lookups.saturating_sub(count);
            state.reclaim(ino);
        }
    }

    pub fn snapshot(&self) -> serde_json::Value {
        let state = self.state.lock();
        let mut references = [0_u64; 4];
        let mut lookups = 0;
        for record in state.records.values() {
            lookups += record.lookups;
            for (total, count) in references.iter_mut().zip(record.references) {
                *total += count;
            }
        }
        serde_json::json!({"records":state.records.len(), "active":state.active.len(), "capacity":state.capacity, "lookups":lookups, "open_references":references[0], "inflight_references":references[1], "notification_references":references[2], "directory_references":references[3], "reclaimed":state.reclaimed})
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn references_delay_reclamation_and_retirement_never_reuses_identity() {
        let table = Inodes::new(8, Some("root".into())).unwrap();
        let original = table.allocate("file", ReferenceKind::Work).unwrap();
        let ino = original.ino();
        table.add_lookup(ino).unwrap();
        let open = table.pin(ino, ReferenceKind::Open).unwrap();
        let notification = table.pin(ino, ReferenceKind::Notification).unwrap();
        let directory = table.pin(ino, ReferenceKind::Directory).unwrap();
        table.retain_active(|id| id == "root");
        let replacement = table.allocate("file", ReferenceKind::Work).unwrap();
        assert_ne!(ino, replacement.ino());
        assert!(!table.is_active(ino, "file"));
        table.forget(ino, 1);
        drop(original);
        drop(open);
        drop(directory);
        assert_eq!(table.id(ino).as_deref(), Some("file"));
        drop(notification);
        assert_eq!(table.id(ino), None);
        assert!(table.is_active(replacement.ino(), "file"));
        let newer = replacement.ino();
        drop(replacement);
        assert!(table.allocate("file", ReferenceKind::Work).unwrap().ino() > newer);
        assert_eq!(table.snapshot()["records"], 3);
    }

    #[test]
    fn lookup_and_capacity_limits_recover_after_forget() {
        let table = Inodes::new(4, None).unwrap();
        let file = table.allocate("file", ReferenceKind::Work).unwrap();
        let ino = file.ino();
        table.add_lookup(ino).unwrap();
        table.add_lookup(ino).unwrap();
        drop(file);
        assert!(
            matches!(table.allocate("other", ReferenceKind::Work), Err(error) if error.code == libc::ENFILE)
        );
        table.forget(ino, 1);
        assert!(table.id(ino).is_some());
        table.forget(ino, 1);
        assert!(table.id(ino).is_none());
        assert!(table.allocate("other", ReferenceKind::Work).is_ok());
        assert!(table.pin(ino, ReferenceKind::Work).is_err());
    }
}
