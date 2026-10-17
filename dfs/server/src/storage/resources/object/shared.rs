use dfs_protocol::ObjectId;
use foundationdb::{FdbBindingError, RangeOption, Transaction};

use super::{ALLOW, Error, GRANT_FAMILY, GRANT_MODE_MASK, ObjectResource, REVERSE_GRANT_FAMILY};
use crate::storage::{
    self,
    resources::{
        SUBJECT_MAX_BYTES, keys::tenant_subspace, page, session::SessionResource,
        tenant::TenantResource,
    },
};

impl ObjectResource {
    /**
     * @cc [owner:spolu,label:backend;security] shared-grant-candidates
     * Callers MUST supply a positive limit. Scan only the tenant's reverse ALLOW index for the
     * exact subject, with conflict tracking and at most limit entries plus one lookahead.
     * After MUST exclude every mode for that object ID. Results MUST follow object-ID order,
     * allowing repeated IDs for distinct modes, and indicate whether more entries remain.
     * Candidates MUST still undergo existence and effective-read checks before being exposed.
     */
    pub(in crate::storage::resources) async fn granted_objects_for_subject(
        tx: &Transaction,
        tenant: &TenantResource,
        subject: &str,
        after: Option<ObjectId>,
        limit: usize,
    ) -> Result<(Vec<ObjectId>, bool), storage::Error<Error>> {
        let grants =
            tenant_subspace(&tenant.tenant_id).subspace(&(REVERSE_GRANT_FAMILY, ALLOW, subject));
        let after = after.map(|id| grants.pack(&(id.as_bytes().as_slice(), GRANT_MODE_MASK)));
        let page = page::read_page(tx, &grants, after, limit).await?;
        let mut ids = Vec::with_capacity(page.entries.len());
        for (key, _) in page.entries {
            let (id, mode): (Vec<u8>, u32) =
                grants.unpack(&key).map_err(|_| Error::InvalidStoredGrant)?;
            if mode & !GRANT_MODE_MASK != 0 || grants.pack(&(id.as_slice(), mode)) != key {
                return Err(Error::InvalidStoredGrant.into());
            }
            ids.push(
                ObjectId::try_from(id.as_slice())
                    .map_err(storage::Error::<Error>::InvalidObjectId)?,
            );
        }
        Ok((ids, page.next_after.is_some()))
    }

    /**
     * @cc [owner:spolu,label:backend;security] shared-grant-membership
     * Membership MUST require an explicit ALLOW on this object matching a session subject exactly,
     * including zero or write-only modes. Read the tenant-scoped forward index with conflict
     * tracking; inherited ALLOW and DENY MUST NOT establish membership. Callers MUST separately
     * check object existence and effective read in the same transaction.
     */
    pub(in crate::storage::resources) async fn has_matching_allow(
        tx: &Transaction,
        session: &SessionResource,
        object_id: ObjectId,
    ) -> Result<bool, storage::Error<Error>> {
        if session.subjects.is_empty() {
            return Ok(false);
        }
        let grants = tenant_subspace(&session.tenant.tenant_id).subspace(&(
            GRANT_FAMILY,
            object_id.as_bytes().as_slice(),
            ALLOW,
        ));
        let mut next_range = Some(RangeOption::from(grants.range()));
        let mut iteration = 1;
        while let Some(range) = next_range {
            let batch = tx
                .get_range(&range, iteration, false)
                .await
                .map_err(FdbBindingError::from)?;
            next_range = range.next_range(&batch);
            for entry in &batch {
                let (subject, mode): (String, u32) = grants
                    .unpack(entry.key())
                    .map_err(|_| Error::InvalidStoredGrant)?;
                if subject.is_empty()
                    || subject.len() > SUBJECT_MAX_BYTES
                    || mode & !GRANT_MODE_MASK != 0
                    || grants.pack(&(subject.as_str(), mode)) != entry.key()
                {
                    return Err(Error::InvalidStoredGrant.into());
                }
                if session.subjects.contains(&subject) {
                    return Ok(true);
                }
            }
            iteration += 1;
        }
        Ok(false)
    }
}
