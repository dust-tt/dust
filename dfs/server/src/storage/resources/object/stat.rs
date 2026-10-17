use dfs_protocol::{
    ObjectRef,
    rpc::{Attr, ExtendedMetadata, ObjectKind},
};
use foundationdb::{FdbBindingError, Transaction};
use futures::future::try_join_all;

use super::{
    EMPTY_SIZE_BYTES, Error, GRANT_READ_MODE, GRANT_WRITE_MODE, INITIAL_VERSION, Mode,
    ObjectResource,
};
use crate::storage::{
    self,
    resources::{directory::VIRTUAL_SHARED_NAME, session::SessionResource},
};

const OWNER_MODE_SHIFT_BITS: u32 = 6;
const DIRECTORY_EXECUTE_MODE: u32 = 0o100;
const VIRTUAL_READ_MODE: u32 = (GRANT_READ_MODE << OWNER_MODE_SHIFT_BITS) | DIRECTORY_EXECUTE_MODE;
const OWNER_WRITE_MODE: u32 = GRANT_WRITE_MODE << OWNER_MODE_SHIFT_BITS;
const VIRTUAL_CREATED_AT_MS: u64 = 0;

// This is the first of a series of computer MIME types when one has not been explicitely
// specified. Will be moved to a dedicated file once we have more of them.
const VIRTUAL_DIRECTORY_MIME_TYPE: &str = "inode/directory";

impl ObjectResource {
    /**
     * @cc [owner:spolu,label:backend;security] object-stat-authorized-snapshot
     * Callers MUST call Stat before staging writes and MUST NOT stage writes concurrently with it.
     * Stat MUST evaluate session modes and fetch attributes in the caller's transaction. Results
     * MUST preserve input order and duplicates, returning NotFound for missing objects and
     * NotAuthorized for unreadable real objects as per-object errors. FDB failures MUST propagate
     * through the outer result so the caller's transaction can retry.
     * Returned store_version MUST equal the transaction's read version.
     * Requested stored metadata MUST use that same transaction and follow authorization.
     * When not requested, metadata MUST remain unloaded and absent from the response.
     */
    /**
     * @cc [owner:spolu,label:backend] object-stat-references
     * Stat MUST validate every reference before reading. Invalid references MUST fail the batch
     * with InvalidId. Virtual root MUST return the tenant's real root ID; shared MUST retain its
     * virtual reference.
     */
    /**
     * @cc [owner:spolu,label:backend] virtual-stat-metadata
     * When metadata is requested, virtual root and shared MUST return created at zero, MIME type
     * inode/directory, and an empty xattr map, without reading stored metadata.
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
        include_metadata: bool,
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
        let mut modes = Self::modes_for_session(tx, session, &object_ids)
            .await?
            .into_iter();
        let version = tx.get_read_version().await.map_err(FdbBindingError::from)?;
        try_join_all(object_refs.iter().map(|reference| {
            let object = match reference {
                ObjectRef::Object(_) | ObjectRef::Root => modes.next().flatten(),
                ObjectRef::Shared | ObjectRef::Invalid => None,
            };
            async move {
                match reference {
                    ObjectRef::Object(_) => {
                        Self::stat_object(tx, object, version, include_metadata).await
                    }
                    ObjectRef::Root => Ok(Self::stat_root(object, version, include_metadata)),
                    ObjectRef::Shared => Ok(Ok(Self::stat_shared(version, include_metadata))),
                    ObjectRef::Invalid => Ok(Err(Error::InvalidId)),
                }
            }
        }))
        .await
    }

    async fn stat_object(
        tx: &Transaction,
        object: Option<(Self, Mode)>,
        version: i64,
        include_metadata: bool,
    ) -> Result<Result<Attr, Error>, storage::Error<Error>> {
        let Some((mut object, mode)) = object else {
            return Ok(Err(Error::NotFound));
        };
        let mode = match object.attr_mode(mode) {
            Ok(mode) => mode,
            Err(error) => return Ok(Err(error)),
        };
        if include_metadata {
            object.load_metadata(tx).await?;
        }
        Ok(Ok(object.to_attr(mode, version)))
    }

    /**
     * @cc [owner:spolu,label:backend;security] virtual-root-stat
     * Virtual root MUST project the stored tenant root's attributes and versions with an empty name
     * and real root ID. It MUST remain readable regardless of stored-root read access, reporting
     * 0o700 when the session has write access on the stored root and 0o500 otherwise.
     */
    fn stat_root(
        object: Option<(Self, Mode)>,
        version: i64,
        include_metadata: bool,
    ) -> Result<Attr, Error> {
        let (root, mode) = object.ok_or(Error::NotFound)?;
        let mode = VIRTUAL_READ_MODE
            | if mode.can_write() {
                OWNER_WRITE_MODE
            } else {
                0
            };
        let mut attr = root.to_attr(mode, version);
        attr.name.clear();
        attr.metadata = include_metadata.then(Self::virtual_metadata);
        Ok(attr)
    }

    /**
     * @cc [owner:spolu,label:backend] virtual-shared-stat
     * Virtual shared MUST report a read-only directory named shared with zero size, no stored
     * timestamps, and attr_version, content_version, and grants_version fixed at 1, regardless of
     * grants or topology changes. Its reference MUST remain Shared.
     */
    fn stat_shared(version: i64, include_metadata: bool) -> Attr {
        Attr {
            id: ObjectRef::Shared,
            name: VIRTUAL_SHARED_NAME.to_owned(),
            kind: ObjectKind::Directory.into(),
            size: EMPTY_SIZE_BYTES,
            mode: VIRTUAL_READ_MODE,
            atime: None,
            mtime: None,
            ctime: None,
            attr_version: INITIAL_VERSION,
            content_version: INITIAL_VERSION,
            grants_version: INITIAL_VERSION,
            store_version: version,
            metadata: include_metadata.then(Self::virtual_metadata),
        }
    }

    fn virtual_metadata() -> ExtendedMetadata {
        ExtendedMetadata {
            created: VIRTUAL_CREATED_AT_MS,
            mime_type: Some(VIRTUAL_DIRECTORY_MIME_TYPE.to_owned()),
            xattrs: Default::default(),
        }
    }

    /**
     * @cc [owner:spolu,label:backend;security] object-attr-snapshot
     * The object MUST come from the caller's transaction, with mode evaluated for that object in
     * that transaction. Attributes MUST use its read version without refetching or loading metadata.
     * Unreadable objects MUST fail with NotAuthorized before checking kind. Owner read/write bits
     * MUST match the mode, with owner execute only for directories and no other bits set.
     */
    pub(in crate::storage::resources) async fn attr(
        &self,
        tx: &Transaction,
        mode: Mode,
    ) -> Result<Attr, storage::Error<Error>> {
        let mode = self.attr_mode(mode)?;
        let version = tx.get_read_version().await.map_err(FdbBindingError::from)?;
        Ok(self.to_attr(mode, version))
    }

    pub(super) fn attr_mode(&self, mode: Mode) -> Result<u32, Error> {
        if !mode.can_read() {
            return Err(Error::NotAuthorized);
        }
        match self.kind {
            ObjectKind::File => Ok(mode.bits() << OWNER_MODE_SHIFT_BITS),
            ObjectKind::Directory => {
                Ok((mode.bits() << OWNER_MODE_SHIFT_BITS) | DIRECTORY_EXECUTE_MODE)
            }
            ObjectKind::Symlink => Err(Error::UnsupportedKind),
        }
    }

    fn to_attr(&self, mode: u32, version: i64) -> Attr {
        Attr {
            id: self.object_id.into(),
            name: self.name.clone(),
            kind: self.kind.into(),
            size: self.size,
            mode,
            atime: self.atime_ms,
            mtime: self.mtime_ms,
            ctime: self.ctime_ms,
            attr_version: self.attr_version,
            content_version: self.content_version,
            grants_version: self.grants_version,
            store_version: version,
            metadata: self.metadata.as_ref().map(|metadata| ExtendedMetadata {
                created: metadata.created_at_ms,
                mime_type: metadata.mime_type.clone(),
                xattrs: metadata
                    .xattrs
                    .iter()
                    .map(|(name, value)| (name.clone(), value.clone()))
                    .collect(),
            }),
        }
    }
}
