use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use dfs_protocol::{
    ObjectId,
    rpc::{Grant, ObjectKind, grant},
};
use foundationdb::{FdbBindingError, RangeOption, Transaction};
use futures::{StreamExt, TryStreamExt, stream};

use super::{Error, GRANT_READ_MODE, GRANT_WRITE_MODE, ObjectResource, hints::Hint};
use crate::storage::{self, resources::session::SessionResource};

const CONCURRENT_READS: usize = 32;

/// Effective read/write grant bits, before conversion to POSIX owner permissions.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Mode(u32);

impl Mode {
    pub fn can_read(self) -> bool {
        self.0 & GRANT_READ_MODE != 0
    }

    pub fn can_write(self) -> bool {
        self.0 & GRANT_WRITE_MODE != 0
    }

    pub fn bits(self) -> u32 {
        self.0
    }
}

#[derive(Default)]
struct ObjectMode {
    allow: u32,
    deny: u32,
}

impl ObjectResource {
    /**
     * @cc [owner:spolu,label:backend;security] object-granted-modes
     * Every call MUST read each target and its full ancestry through the session's tenant root in
     * the caller's transaction with conflict tracking. Changed parents MUST be followed from fresh
     * records. Complete cached grants MUST replace grant reads only when grants_version matches;
     * cache misses MUST read every explicit grant in that transaction with conflict tracking.
     * Results MUST preserve input order and duplicates, with None for missing targets and zero
     * mode for existing targets without access. Broken or cyclic ancestry MUST fail closed.
     */
    /**
     * @cc [owner:spolu,label:backend;security] grant-cache-committed-state
     * Callers MUST call session_modes before staging any writes in the transaction and MUST NOT
     * stage writes concurrently with it. Cached grant sets and their versions MUST come from the
     * same committed transaction view; staged grants MUST NOT enter the shared cache.
     */
    /**
     * @cc [owner:spolu,label:backend;security] inherited-grant-evaluation
     * Starting with zero at the root, each object MUST remove all local DENY bits from inherited
     * permissions before adding ALLOW bits whose subjects exactly match the session. Evaluation
     * MUST continue through zero permissions so a deeper ALLOW can restore access. Only read and
     * write bits may be returned.
     */
    pub async fn session_modes(
        tx: &Transaction,
        session: &SessionResource,
        object_ids: &[ObjectId],
    ) -> Result<Vec<Option<Mode>>, storage::Error<Error>> {
        for id in object_ids {
            id.validate().map_err(|_| Error::InvalidId)?;
        }
        let tenant = &session.tenant;
        let hints = &session.tree_hints;
        let mut pending = object_ids.to_vec();
        let mut prefetched = HashMap::new();
        let mut objects = HashMap::new();
        let mut missing = HashSet::new();

        while !pending.is_empty() {
            let predicted = hints.predict(&tenant.tenant_id, &pending).await;
            let reads = stream::iter(predicted.into_iter().filter(|id| {
                !prefetched.contains_key(id) && !objects.contains_key(id) && !missing.contains(id)
            }))
            .map(|id| async move {
                let value = tx
                    .get(&Self::object_key(&tenant.tenant_id, &id), false)
                    .await
                    .map_err(FdbBindingError::from)?;
                Ok::<_, storage::Error<Error>>((id, value))
            })
            .buffer_unordered(CONCURRENT_READS)
            .try_collect::<Vec<_>>()
            .await?;
            prefetched.extend(reads);

            let mut next = HashSet::new();
            while let Some(id) = pending.pop() {
                if objects.contains_key(&id) || missing.contains(&id) {
                    continue;
                }
                let Some(value) = prefetched.remove(&id) else {
                    next.insert(id);
                    continue;
                };
                let Some(value) = value else {
                    missing.insert(id);
                    continue;
                };
                // Decode only actual ancestors; obsolete hints may point to unrelated records.
                let object = Self::from_value(tenant, &id, &value)?;
                if let Some(parent_id) = object.parent_id {
                    pending.push(parent_id);
                }
                objects.insert(id, object);
            }
            pending.extend(next);
        }

        let mut grants_by_object = hints
            .cached_grants(
                &tenant.tenant_id,
                objects
                    .values()
                    .map(|object| (object.object_id, object.grants_version)),
            )
            .await;
        let reads: Vec<_> = objects
            .values()
            .filter(|object| !grants_by_object.contains_key(&object.object_id))
            .map(|object| async move {
                let grants = object.load_grants(tx).await?;
                Ok::<_, storage::Error<Error>>((object.object_id, Arc::from(grants)))
            })
            .collect();
        let grants: Vec<_> = stream::iter(reads)
            .buffer_unordered(CONCURRENT_READS)
            .try_collect()
            .await?;
        grants_by_object.extend(grants);

        let mut resolved = HashMap::new();
        let mut results = Vec::with_capacity(object_ids.len());
        for id in object_ids {
            if missing.contains(id) {
                results.push(None);
                continue;
            }
            let mut path = Vec::new();
            let mut visited = HashSet::new();
            let mut current = *id;
            let mut mode = loop {
                if let Some(mode) = resolved.get(&current) {
                    break *mode;
                }
                if !visited.insert(current) {
                    return Err(Error::InvalidAncestry.into());
                }
                let object = objects.get(&current).ok_or(Error::InvalidAncestry)?;
                path.push(current);
                if current == tenant.root_id {
                    if object.parent_id.is_some() || object.kind != ObjectKind::Directory {
                        return Err(Error::InvalidAncestry.into());
                    }
                    break Mode::default();
                }
                let parent_id = object.parent_id.ok_or(Error::InvalidAncestry)?;
                let parent = objects.get(&parent_id).ok_or(Error::InvalidAncestry)?;
                if parent.kind != ObjectKind::Directory {
                    return Err(Error::InvalidAncestry.into());
                }
                current = parent_id;
            };
            for id in path.into_iter().rev() {
                let grants = grants_by_object.get(&id).ok_or(Error::InvalidAncestry)?;
                let object_mode = Self::object_mode(session, grants)?;
                mode = Mode((mode.0 & !object_mode.deny) | object_mode.allow);
                resolved.insert(id, mode);
            }
            results.push(Some(mode));
        }
        hints
            .remember(
                &tenant.tenant_id,
                objects.values().filter_map(|object| {
                    let grants = grants_by_object.remove(&object.object_id)?;
                    Some((
                        object.object_id,
                        Hint {
                            parent_id: object.parent_id,
                            grants_version: object.grants_version,
                            grants,
                        },
                    ))
                }),
                missing,
            )
            .await;
        Ok(results)
    }

    async fn load_grants(&self, tx: &Transaction) -> Result<Vec<Grant>, storage::Error<Error>> {
        let mut grants = Vec::new();
        let mut next_range = Some(RangeOption::from(self.grant_subspace().range()));
        let mut iteration = 1;
        while let Some(range) = next_range {
            let batch = tx
                .get_range(&range, iteration, false)
                .await
                .map_err(FdbBindingError::from)?;
            next_range = range.next_range(&batch);
            for entry in &batch {
                grants.push(self.grant_from_key(entry.key())?);
            }
            iteration += 1;
        }
        Ok(grants)
    }

    fn object_mode(session: &SessionResource, grants: &[Grant]) -> Result<ObjectMode, Error> {
        let mut mode = ObjectMode::default();
        for grant in grants {
            match &grant.kind {
                Some(grant::Kind::Allow(allow)) => {
                    if session.subjects.contains(&allow.subject) {
                        mode.allow |= allow.mode;
                    }
                }
                Some(grant::Kind::Deny(deny)) => mode.deny |= deny.mode,
                None => return Err(Error::InvalidStoredGrant),
            }
        }
        Ok(mode)
    }
}
