use dfs_protocol::{
    ObjectRef,
    rpc::{Attr, ObjectKind, ReadView},
};
use foundationdb::{FdbBindingError, Transaction};
use futures::future::try_join_all;

use super::{Error, ObjectResource};
use crate::storage::{self, resources::session::SessionResource};

const OWNER_MODE_SHIFT_BITS: u32 = 6;
const DIRECTORY_EXECUTE_MODE: u32 = 0o100;

impl ObjectResource {
    /**
     * @cc [owner:spolu,label:backend;security] object-stat-authorized-snapshot
     * Stat MUST evaluate session modes and fetch attributes in the caller's transaction. Results
     * MUST preserve input order and duplicates, returning NotFound for missing objects and
     * NotAuthorized for unreadable objects as per-object errors. FDB failures MUST propagate through
     * the outer result so the caller's transaction can retry.
     * Both view versions MUST equal that transaction's read version. Metadata MUST remain unloaded.
     */
    /**
     * @cc [owner:spolu,label:backend] object-stat-references
     * Stat MUST validate every reference before reading. Invalid references MUST fail the batch
     * with InvalidId. Until implemented, virtual root and shared MUST return UnsupportedReference
     * per reference without dropping other results.
     */
    /**
     * @cc [owner:spolu,label:api;security] object-stat-mode
     * Returned owner read/write bits MUST match the session mode. Only readable directories MUST
     * receive owner execute; all other mode bits MUST be zero.
     */
    pub async fn stat(
        tx: &Transaction,
        session: &SessionResource,
        object_refs: &[ObjectRef],
    ) -> Result<Vec<Result<Attr, Error>>, storage::Error<Error>> {
        for reference in object_refs {
            reference.validate().map_err(|_| Error::InvalidId)?;
        }
        let object_ids: Vec<_> = object_refs
            .iter()
            .filter_map(|reference| match reference {
                ObjectRef::Object(id) => Some(*id),
                _ => None,
            })
            .collect();
        let mut modes = Self::session_modes(tx, session, &object_ids)
            .await?
            .into_iter();
        let version = tx.get_read_version().await.map_err(FdbBindingError::from)?;
        try_join_all(object_refs.iter().map(|reference| {
            let mode = match reference {
                ObjectRef::Object(_) => modes.next().flatten(),
                _ => None,
            };
            async move {
                let id = match reference {
                    ObjectRef::Object(id) => id,
                    ObjectRef::Root | ObjectRef::Shared => {
                        return Ok(Err(Error::UnsupportedReference));
                    }
                    ObjectRef::Invalid => return Ok(Err(Error::InvalidId)),
                };
                let Some(mode) = mode else {
                    return Ok(Err(Error::NotFound));
                };
                if !mode.can_read() {
                    return Ok(Err(Error::NotAuthorized));
                }
                let Some(object) = Self::fetch(tx, &session.tenant, id).await? else {
                    return Ok(Err(Error::NotFound));
                };
                let mode = match object.kind {
                    ObjectKind::File => mode.bits() << OWNER_MODE_SHIFT_BITS,
                    ObjectKind::Directory => {
                        (mode.bits() << OWNER_MODE_SHIFT_BITS) | DIRECTORY_EXECUTE_MODE
                    }
                    ObjectKind::Symlink => return Ok(Err(Error::UnsupportedKind)),
                };
                Ok(Ok(Attr {
                    id: object.object_id.into(),
                    name: object.name,
                    kind: object.kind.into(),
                    size: object.size,
                    mode,
                    atime: object.atime_ms,
                    mtime: object.mtime_ms,
                    ctime: object.ctime_ms,
                    attr_version: object.attr_version,
                    content_version: object.content_version,
                    view: ReadView {
                        store_version: version,
                        auth_version: version,
                    },
                    metadata: None,
                }))
            }
        }))
        .await
    }
}
