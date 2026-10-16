use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{Entry, EntryPage},
};
use foundationdb::Transaction;

use super::{ChildPage, DirectoryResource, Error, VIRTUAL_SHARED_NAME};
use crate::storage::{
    self,
    resources::{
        object::{self, ObjectResource},
        session::SessionResource,
    },
};

impl DirectoryResource {
    /**
     * @cc [owner:pmilliotte,label:backend;security] list-requires-directory-and-child-read
     * Listing MUST require read on the directory in the caller's transaction; a missing directory
     * MUST fail with Object(NotFound) and an unreadable one with Object(NotAuthorized), before
     * checking its kind. Only readable children MUST be returned, with Stat's Attr. The virtual root
     * needs no read on the stored root; its children do.
     */
    /**
     * @cc [owner:pmilliotte,label:backend] list-page-cursor
     * A page MUST hold at most `limit` entries in name order. Hidden children MAY shorten a page,
     * even to zero entries; next_after MUST be absent only once the listing is complete.
     */
    /**
     * @cc [owner:pmilliotte,label:product] list-virtual-directories
     * Listing virtual root MUST include virtual shared as an entry named `shared`, in name order
     * among the stored root's children. Listing the contents of virtual shared MUST fail with
     * SharedUnsupported.
     */
    pub async fn list_for_session(
        tx: &Transaction,
        session: &SessionResource,
        directory_ref: ObjectRef,
        after: Option<&str>,
        limit: u32,
    ) -> Result<EntryPage, storage::Error<Error>> {
        let directory_id = match directory_ref {
            ObjectRef::Object(id) => id,
            ObjectRef::Root => session.tenant.root_id,
            ObjectRef::Shared => return Err(Error::SharedUnsupported.into()),
            ObjectRef::Invalid => return Err(Error::Object(object::Error::InvalidId).into()),
        };
        let is_virtual_root = directory_ref == ObjectRef::Root;
        let directory = Self::fetch_listable(tx, session, directory_id, is_virtual_root).await?;
        let page = directory.list(tx, after, limit).await?;
        let lists_shared = is_virtual_root && directory.page_spans_shared(&page, after)?;

        let mut refs: Vec<ObjectRef> = page
            .entries
            .iter()
            .map(|entry| entry.object_id.into())
            .collect();
        if lists_shared {
            refs.push(ObjectRef::Shared);
        }
        let mut attrs = ObjectResource::stat(tx, session, &refs, false).await?;
        let shared = if lists_shared { attrs.pop() } else { None };

        let mut entries = Vec::with_capacity(refs.len());
        for (entry, attr) in page.entries.into_iter().zip(attrs) {
            match attr {
                Ok(attr) => entries.push(Entry {
                    name: entry.name,
                    object: Some(attr),
                }),
                Err(object::Error::NotFound | object::Error::NotAuthorized) => {}
                Err(error) => return Err(Error::Object(error).into()),
            }
        }
        let mut next_after = page.next_after;
        if let Some(shared) = shared {
            let attr = shared.map_err(Error::Object)?;
            let index = entries.partition_point(|entry| entry.name.as_str() < VIRTUAL_SHARED_NAME);
            entries.insert(
                index,
                Entry {
                    name: VIRTUAL_SHARED_NAME.to_owned(),
                    object: Some(attr),
                },
            );
        }
        let limit = usize::try_from(limit).map_err(|_| Error::InvalidPageLimit)?;
        if entries.len() > limit {
            entries.truncate(limit);
            next_after = entries
                .last()
                .map(|entry| directory.cursor_for(&entry.name));
        }
        Ok(EntryPage {
            entries,
            next_after,
        })
    }

    async fn fetch_listable(
        tx: &Transaction,
        session: &SessionResource,
        directory_id: ObjectId,
        is_virtual_root: bool,
    ) -> Result<Self, storage::Error<Error>> {
        let (object, mode) = ObjectResource::modes_for_session(tx, session, &[directory_id])
            .await?
            .pop()
            .flatten()
            .ok_or(Error::Object(object::Error::NotFound))?;
        if !is_virtual_root && !mode.can_read() {
            return Err(Error::Object(object::Error::NotAuthorized).into());
        }
        Ok(Self::try_from(object)?)
    }

    /// Whether `shared`'s position in name order falls between `after` and the end of `page`.
    fn page_spans_shared(&self, page: &ChildPage, after: Option<&str>) -> Result<bool, Error> {
        let after_name = after
            .map(|after| self.name_from_cursor(after))
            .transpose()?;
        let starts_before = after_name.is_none_or(|name| name.as_str() < VIRTUAL_SHARED_NAME);
        let ends_after = page.next_after.is_none()
            || page
                .entries
                .last()
                .is_some_and(|entry| entry.name.as_str() > VIRTUAL_SHARED_NAME);
        Ok(starts_before && ends_after)
    }
}
