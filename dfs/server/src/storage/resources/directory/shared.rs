use std::collections::BTreeSet;

use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{Entry, EntryPage},
};
use foundationdb::Transaction;
use futures::{StreamExt, TryStreamExt, stream};

use super::{DirectoryResource, Error, PAGE_MAX_ENTRIES};
use crate::storage::{
    self,
    resources::{
        CONCURRENT_READS,
        keys::tenant_subspace,
        object::{self, ObjectResource},
        page,
        session::SessionResource,
    },
};

// This prefix scopes continuation tokens; it does not store any records.
const SHARED_CURSOR_FAMILY: &str = "shared-cursor";
const SHARED_NAME_SEPARATOR: &str = "--";

impl DirectoryResource {
    /**
     * @cc [owner:spolu,label:backend;security] shared-list-visibility
     * Callers MUST list before staging writes. Discover candidates only through ALLOW attachments
     * matching the session's subjects. Return each existing, effectively readable object once,
     * with Stat's attributes and current basename suffixed by --<object-id>. Membership, modes,
     * and attributes MUST use the caller's transaction. Parent readability MUST NOT be required.
     */
    /**
     * @cc [owner:spolu,label:backend;performance] shared-list-pagination
     * Limits MUST be 1-4096. Pages MUST be ordered by object ID, with cursors scoped to tenant and
     * session and exclusive of every grant for the last processed ID. Scans MUST use bounded
     * concurrency and divide the page budget across subjects. Bounded scans or hidden candidates
     * MAY shorten pages, including to zero entries; continuation MUST NOT skip unexamined IDs.
     */
    pub(super) async fn list_shared_for_session(
        tx: &Transaction,
        session: &SessionResource,
        after: Option<&str>,
        limit: u32,
    ) -> Result<EntryPage, storage::Error<Error>> {
        let limit = usize::try_from(limit).map_err(|_| Error::InvalidPageLimit)?;
        if limit == 0 || limit > PAGE_MAX_ENTRIES {
            return Err(Error::InvalidPageLimit.into());
        }
        let cursors = tenant_subspace(&session.tenant.tenant_id)
            .subspace(&(SHARED_CURSOR_FAMILY, session.session_id.as_str()));
        let after = after
            .map(|cursor| {
                let key =
                    page::decode_cursor(&cursors, cursor, |_| true).ok_or(Error::InvalidCursor)?;
                let id: Vec<u8> = cursors.unpack(&key).map_err(|_| Error::InvalidCursor)?;
                if cursors.pack(&id.as_slice()) != key {
                    return Err(Error::InvalidCursor);
                }
                ObjectId::try_from(id.as_slice()).map_err(|_| Error::InvalidCursor)
            })
            .transpose()?;

        let per_subject_limit = limit.div_ceil(session.subjects.len().max(1));
        let reads: Vec<_> = session
            .subjects
            .iter()
            .map(|subject| async move {
                ObjectResource::granted_objects_for_subject(
                    tx,
                    &session.tenant,
                    subject,
                    after,
                    per_subject_limit,
                )
                .await
            })
            .collect();
        let pages: Vec<_> = stream::iter(reads)
            .buffer_unordered(CONCURRENT_READS)
            .try_collect()
            .await?;

        // Every unfinished scan has covered IDs through its last entry. Only emit the common
        // covered prefix, or advancing the cursor could skip unseen IDs from another subject.
        let covered_through = pages
            .iter()
            .filter_map(|(ids, more)| more.then(|| ids.last().copied()).flatten())
            .min();
        let candidates: BTreeSet<_> = pages.into_iter().flat_map(|(ids, _)| ids).collect();
        let mut ids: Vec<_> = candidates
            .into_iter()
            .take_while(|id| covered_through.is_none_or(|end| *id <= end))
            .collect();
        let more = covered_through.is_some() || ids.len() > limit;
        ids.truncate(limit);
        // Advance over hidden candidates too, so even an empty page makes progress.
        let next_after = if more {
            ids.last()
                .map(|id| page::encode_cursor(&cursors.pack(&id.as_bytes().as_slice())))
        } else {
            None
        };
        let refs: Vec<_> = ids.iter().copied().map(ObjectRef::Object).collect();
        let attrs = ObjectResource::stat(tx, session, &refs, false).await?;
        let mut entries = Vec::with_capacity(attrs.len());
        for (id, attr) in ids.into_iter().zip(attrs) {
            match attr {
                Ok(attr) => entries.push(Entry {
                    name: format!("{}{SHARED_NAME_SEPARATOR}{id}", attr.name),
                    object: Some(attr),
                }),
                Err(object::Error::NotFound | object::Error::NotAuthorized) => {}
                Err(error) => return Err(Error::Object(error).into()),
            }
        }
        Ok(EntryPage {
            entries,
            next_after,
        })
    }

    /**
     * @cc [owner:spolu,label:backend;security] shared-lookup-alias
     * Parse the lowercase UUIDv7 after the last --. The decorative prefix MUST be a valid basename
     * or empty, independently of the suffix's length, and MUST NOT need to match the current name.
     * Missing explicit ALLOW membership MUST return Object(NotFound). The caller MUST check
     * existence and effective read in the same transaction before returning attributes.
     */
    pub(super) async fn resolve_shared_for_session(
        tx: &Transaction,
        session: &SessionResource,
        name: &str,
    ) -> Result<Result<ObjectRef, Error>, storage::Error<Error>> {
        let Some((prefix, suffix)) = name.rsplit_once(SHARED_NAME_SEPARATOR) else {
            return Ok(Err(Error::InvalidName));
        };
        if !prefix.is_empty()
            && let Err(error) = Self::validate_name(prefix)
        {
            return Ok(Err(error));
        }
        let id: ObjectId = match suffix.parse() {
            Ok(id) if !suffix.contains('/') => id,
            _ => return Ok(Err(Error::InvalidName)),
        };
        if !ObjectResource::has_matching_allow(tx, session, id).await? {
            return Ok(Err(Error::Object(object::Error::NotFound)));
        }
        Ok(Ok(id.into()))
    }
}
