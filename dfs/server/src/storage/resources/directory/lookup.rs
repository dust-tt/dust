use dfs_protocol::{
    ObjectRef,
    rpc::{Attr, LookupTarget},
};
use foundationdb::Transaction;
use futures::{StreamExt, TryStreamExt, stream};

use super::{DirectoryResource, Error, VIRTUAL_SHARED_NAME};
use crate::storage::{
    self,
    resources::{
        CONCURRENT_READS,
        object::{self, Mode, ObjectResource},
        session::SessionResource,
    },
};

impl DirectoryResource {
    /**
     * @cc [owner:pmilliotte,label:backend;security] lookup-requires-parent-and-child-read
     * A target MUST resolve only when the session can read its parent and its child in the caller's
     * transaction. An unreadable parent MUST return NotFound, as a missing one would, whatever it
     * contains or is. An unreadable child MUST fail through Stat's authorization, never with its
     * Attr. Virtual root and shared need no stored-parent read; their children must be readable.
     */
    /**
     * @cc [owner:pmilliotte,label:backend] lookup-batch-results
     * Results MUST preserve input order and duplicates. Found children MUST return Stat's Attr.
     */
    /**
     * @cc [owner:pmilliotte,label:product] lookup-virtual-parents
     * Under virtual root, `shared` MUST resolve to virtual shared. Under virtual shared, aliases
     * MUST resolve by ID only when an explicit ALLOW matches a session subject and Stat permits read.
     */
    pub async fn lookup_for_session(
        tx: &Transaction,
        session: &SessionResource,
        targets: &[LookupTarget],
        include_metadata: bool,
    ) -> Result<Vec<Result<Attr, Error>>, storage::Error<Error>> {
        for target in targets {
            target
                .parent_id
                .validate()
                .map_err(|_| Error::Object(object::Error::InvalidId))?;
        }
        let parent_ids: Vec<_> = targets
            .iter()
            .filter_map(|target| match target.parent_id {
                ObjectRef::Object(id) => Some(id),
                ObjectRef::Root => Some(session.tenant.root_id),
                ObjectRef::Shared | ObjectRef::Invalid => None,
            })
            .collect();
        let mut parents = ObjectResource::modes_for_session(tx, session, &parent_ids)
            .await?
            .into_iter();
        let resolutions: Vec<_> = targets
            .iter()
            .map(|target| {
                let parent = match target.parent_id {
                    ObjectRef::Object(_) | ObjectRef::Root => parents.next().flatten(),
                    ObjectRef::Shared | ObjectRef::Invalid => None,
                };
                Self::resolve_child_for_session(tx, session, target, parent)
            })
            .collect();
        let children: Vec<_> = stream::iter(resolutions)
            .buffered(CONCURRENT_READS)
            .try_collect()
            .await?;

        let found: Vec<_> = children
            .iter()
            .filter_map(|child| child.as_ref().ok().copied())
            .collect();
        let mut attrs = ObjectResource::stat(tx, session, &found, include_metadata)
            .await?
            .into_iter();
        Ok(children
            .into_iter()
            .map(|child| {
                child?;
                attrs
                    .next()
                    .unwrap_or(Err(object::Error::NotFound))
                    .map_err(Error::Object)
            })
            .collect())
    }

    async fn resolve_child_for_session(
        tx: &Transaction,
        session: &SessionResource,
        target: &LookupTarget,
        parent: Option<(ObjectResource, Mode)>,
    ) -> Result<Result<ObjectRef, Error>, storage::Error<Error>> {
        if target.parent_id != ObjectRef::Shared
            && let Err(error) = Self::validate_name(&target.name)
        {
            return Ok(Err(error));
        }
        let readable = match target.parent_id {
            ObjectRef::Root if target.name == VIRTUAL_SHARED_NAME => {
                return Ok(Ok(ObjectRef::Shared));
            }
            ObjectRef::Root => true,
            ObjectRef::Object(_) => parent.as_ref().is_some_and(|(_, mode)| mode.can_read()),
            ObjectRef::Shared => {
                return Self::resolve_shared_for_session(tx, session, &target.name).await;
            }
            ObjectRef::Invalid => return Ok(Err(Error::Object(object::Error::InvalidId))),
        };
        if !readable {
            return Ok(Err(Error::Object(object::Error::NotFound)));
        }
        let Some((parent, _)) = parent else {
            return Ok(Err(Error::Object(object::Error::NotFound)));
        };
        let parent = match Self::try_from(parent) {
            Ok(parent) => parent,
            Err(error) => return Ok(Err(error)),
        };
        let child = parent.lookup(tx, &target.name).await?;
        Ok(child
            .map(ObjectRef::Object)
            .ok_or(Error::Object(object::Error::NotFound)))
    }
}
