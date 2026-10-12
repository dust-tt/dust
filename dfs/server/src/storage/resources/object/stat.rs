use dfs_protocol::{
    ObjectId, ObjectRef,
    rpc::{Attr, ObjectKind, ReadView},
};
use foundationdb::{FdbBindingError, Transaction};
use futures::future::try_join_all;

use super::{
    EMPTY_SIZE_BYTES, Error, GRANT_READ_MODE, GRANT_WRITE_MODE, INITIAL_VERSION, Mode,
    ObjectResource,
};
use crate::storage::{self, resources::session::SessionResource};

const OWNER_MODE_SHIFT_BITS: u32 = 6;
const DIRECTORY_EXECUTE_MODE: u32 = 0o100;
const VIRTUAL_READ_MODE: u32 = (GRANT_READ_MODE << OWNER_MODE_SHIFT_BITS) | DIRECTORY_EXECUTE_MODE;
const OWNER_WRITE_MODE: u32 = GRANT_WRITE_MODE << OWNER_MODE_SHIFT_BITS;

impl ObjectResource {
    /**
     * @cc [owner:spolu,label:backend;security] object-stat-authorized-snapshot
     * Stat MUST evaluate session modes and fetch attributes in the caller's transaction. Results
     * MUST preserve input order and duplicates, returning NotFound for missing objects and
     * NotAuthorized for unreadable real objects as per-object errors. FDB failures MUST propagate
     * through the outer result so the caller's transaction can retry.
     * Both view versions MUST equal that transaction's read version. Metadata MUST remain unloaded.
     */
    /**
     * @cc [owner:spolu,label:backend] object-stat-references
     * Stat MUST validate every reference before reading. Invalid references MUST fail the batch
     * with InvalidId. Virtual root MUST return the tenant's real root ID; shared MUST retain its
     * virtual reference.
     */
    /**
     * @cc [owner:spolu,label:api;security] object-stat-mode
     * For real objects, returned owner read/write bits MUST match the session mode. Only readable
     * directories MUST receive owner execute; all other mode bits MUST be zero.
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
                ObjectRef::Root => Some(session.tenant.root_id),
                ObjectRef::Shared | ObjectRef::Invalid => None,
            })
            .collect();
        let mut modes = Self::session_modes(tx, session, &object_ids)
            .await?
            .into_iter();
        let version = tx.get_read_version().await.map_err(FdbBindingError::from)?;
        try_join_all(object_refs.iter().map(|reference| {
            let mode = match reference {
                ObjectRef::Object(_) | ObjectRef::Root => modes.next().flatten(),
                ObjectRef::Shared | ObjectRef::Invalid => None,
            };
            async move {
                match reference {
                    ObjectRef::Object(id) => {
                        Self::stat_object(tx, session, id, mode, version).await
                    }
                    ObjectRef::Root => Self::stat_root(tx, session, mode, version).await,
                    ObjectRef::Shared => Ok(Ok(Self::stat_shared(version))),
                    ObjectRef::Invalid => Ok(Err(Error::InvalidId)),
                }
            }
        }))
        .await
    }

    async fn stat_object(
        tx: &Transaction,
        session: &SessionResource,
        id: &ObjectId,
        mode: Option<Mode>,
        version: i64,
    ) -> Result<Result<Attr, Error>, storage::Error<Error>> {
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
        Ok(Ok(object.into_attr(mode, version)))
    }

    /**
     * @cc [owner:spolu,label:backend;security] virtual-root-stat
     * Virtual root MUST project the stored tenant root's attributes and versions with an empty name
     * and real root ID. It MUST remain readable regardless of stored-root read access, reporting
     * 0o700 when the session has write access on the stored root and 0o500 otherwise.
     */
    async fn stat_root(
        tx: &Transaction,
        session: &SessionResource,
        mode: Option<Mode>,
        version: i64,
    ) -> Result<Result<Attr, Error>, storage::Error<Error>> {
        let Some(mode) = mode else {
            return Ok(Err(Error::NotFound));
        };
        let Some(root) = Self::fetch(tx, &session.tenant, &session.tenant.root_id).await? else {
            return Ok(Err(Error::NotFound));
        };
        let mode = VIRTUAL_READ_MODE
            | if mode.can_write() {
                OWNER_WRITE_MODE
            } else {
                0
            };
        let mut attr = root.into_attr(mode, version);
        attr.name.clear();
        Ok(Ok(attr))
    }

    /**
     * @cc [owner:spolu,label:backend] virtual-shared-stat
     * Virtual shared MUST report a read-only directory named shared with zero size, no stored
     * timestamps, and both attr_version and content_version fixed at 1, regardless of grants or
     * topology changes. Its reference MUST remain Shared.
     */
    fn stat_shared(version: i64) -> Attr {
        Attr {
            id: ObjectRef::Shared,
            name: "shared".to_owned(),
            kind: ObjectKind::Directory.into(),
            size: EMPTY_SIZE_BYTES,
            mode: VIRTUAL_READ_MODE,
            atime: None,
            mtime: None,
            ctime: None,
            attr_version: INITIAL_VERSION,
            content_version: INITIAL_VERSION,
            view: ReadView {
                store_version: version,
                auth_version: version,
            },
            metadata: None,
        }
    }

    fn into_attr(self, mode: u32, version: i64) -> Attr {
        Attr {
            id: self.object_id.into(),
            name: self.name,
            kind: self.kind.into(),
            size: self.size,
            mode,
            atime: self.atime_ms,
            mtime: self.mtime_ms,
            ctime: self.ctime_ms,
            attr_version: self.attr_version,
            content_version: self.content_version,
            view: ReadView {
                store_version: version,
                auth_version: version,
            },
            metadata: None,
        }
    }
}
