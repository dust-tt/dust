use std::{
    collections::HashMap,
    fmt,
    time::{SystemTime, UNIX_EPOCH},
};

use dfs_protocol::{ObjectId, rpc::ObjectKind};
use foundationdb::{FdbBindingError, Transaction, tuple::pack};

use crate::storage::{
    self,
    resources::{keys::tenant_subspace, tenant::TenantResource},
};

const FAMILY: &str = "object";
const METADATA_FAMILY: &str = "metadata";
const XATTR_FAMILY: &str = "xattr";
const INITIAL_VERSION: u64 = 1;
const EMPTY_SIZE_BYTES: u64 = 0;
const XATTR_NAME_MAX_BYTES: usize = 255;
const XATTRS_MAX_BYTES: usize = 32 * 1024;

#[derive(Debug)]
pub enum Error {
    TimestampGeneration,
    AlreadyExists,
    MissingMetadata,
    InvalidXattrName,
    XattrsTooLarge,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TimestampGeneration => f.write_str("object timestamp generation failed"),
            Self::AlreadyExists => f.write_str("object already exists"),
            Self::MissingMetadata => f.write_str("object creation requires metadata"),
            Self::InvalidXattrName => f.write_str("invalid xattr name"),
            Self::XattrsTooLarge => f.write_str("xattrs exceed the size limit"),
        }
    }
}

impl std::error::Error for Error {}

impl From<Error> for storage::Error<Error> {
    fn from(error: Error) -> Self {
        Self::Resource(error)
    }
}

pub struct ObjectResource {
    pub tenant_id: String,
    pub object_id: ObjectId,
    pub parent_id: Option<ObjectId>,
    pub name: String,
    pub kind: ObjectKind,
    pub size: u64,
    pub atime_ms: Option<u64>,
    pub mtime_ms: Option<u64>,
    pub ctime_ms: Option<u64>,
    pub attr_version: u64,
    pub content_version: u64,
    pub metadata: Option<Metadata>,
}

pub struct Metadata {
    pub created_at_ms: u64,
    pub mime_type: Option<String>,
    pub xattrs: HashMap<String, Vec<u8>>,
}

impl ObjectResource {
    /**
     * @cc [owner:spolu,label:backend] tenant-root-initial-state
     * A new root MUST use the tenant's root ID and be an empty directory with no parent, MIME type,
     * or xattrs, and an empty name. Both versions MUST start at 1. Creation, access, modification, and
     * change times MUST be initialized to the same server timestamp.
     */
    pub fn new_root(tenant: &TenantResource) -> Result<Self, Error> {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| Error::TimestampGeneration)?
            .as_millis()
            .try_into()
            .map_err(|_| Error::TimestampGeneration)?;
        Ok(Self {
            tenant_id: tenant.tenant_id.clone(),
            object_id: tenant.root_id,
            parent_id: None,
            name: String::new(),
            kind: ObjectKind::Directory,
            size: EMPTY_SIZE_BYTES,
            atime_ms: Some(now_ms),
            mtime_ms: Some(now_ms),
            ctime_ms: Some(now_ms),
            attr_version: INITIAL_VERSION,
            content_version: INITIAL_VERSION,
            metadata: Some(Metadata {
                created_at_ms: now_ms,
                mime_type: None,
                xattrs: HashMap::new(),
            }),
        })
    }

    /**
     * @cc [owner:spolu,label:backend;error-handling] object-create-atomicity
     * Creation MUST write attributes, base metadata, and xattrs in the caller's transaction. An
     * occupied object ID in the same tenant MUST return AlreadyExists before staging any writes,
     * preserving the existing object and metadata. Missing metadata or invalid xattrs MUST fail
     * before staging any writes.
     */
    /**
     * @cc [owner:spolu,label:backend] object-xattr-validation
     * Xattr names MUST contain 1-255 UTF-8 bytes without NUL; invalid names MUST return
     * InvalidXattrName. Combined name and value bytes MUST NOT exceed 32 KiB; exceeding this limit
     * MUST return XattrsTooLarge.
     */
    /**
     * @cc [owner:spolu,label:backend] object-xattr-storage
     * Each xattr MUST use a separate key under the object's metadata with its exact name as one
     * tuple component. Values MUST be stored verbatim, including empty bytes for a present xattr.
     */
    pub async fn create(&self, tx: &Transaction) -> Result<(), storage::Error<Error>> {
        let key = Self::object_key(&self.tenant_id, &self.object_id);
        if tx
            .get(&key, false)
            .await
            .map_err(FdbBindingError::from)?
            .is_some()
        {
            return Err(Error::AlreadyExists.into());
        }

        let metadata = self.metadata.as_ref().ok_or(Error::MissingMetadata)?;
        let mut xattrs_bytes = 0;
        for (name, value) in &metadata.xattrs {
            if name.is_empty() || name.len() > XATTR_NAME_MAX_BYTES || name.contains('\0') {
                return Err(Error::InvalidXattrName.into());
            }
            xattrs_bytes += name.len() + value.len();
            if xattrs_bytes > XATTRS_MAX_BYTES {
                return Err(Error::XattrsTooLarge.into());
            }
        }

        let parent_id = self.parent_id.as_ref().map(|id| id.as_bytes().as_slice());
        tx.set(
            &key,
            &pack(&(
                parent_id,
                self.name.as_str(),
                i32::from(self.kind),
                self.size,
                self.atime_ms,
                self.mtime_ms,
                self.ctime_ms,
                self.attr_version,
                self.content_version,
            )),
        );
        tx.set(
            &Self::metadata_key(&self.tenant_id, &self.object_id),
            &pack(&(metadata.created_at_ms, metadata.mime_type.as_deref())),
        );
        for (name, value) in &metadata.xattrs {
            tx.set(
                &Self::xattr_key(&self.tenant_id, &self.object_id, name),
                value,
            );
        }
        Ok(())
    }

    fn object_key(tenant_id: &str, object_id: &ObjectId) -> Vec<u8> {
        tenant_subspace(tenant_id).pack(&(FAMILY, object_id.as_bytes().as_slice()))
    }

    fn metadata_key(tenant_id: &str, object_id: &ObjectId) -> Vec<u8> {
        tenant_subspace(tenant_id).pack(&(METADATA_FAMILY, object_id.as_bytes().as_slice()))
    }

    fn xattr_key(tenant_id: &str, object_id: &ObjectId, name: &str) -> Vec<u8> {
        tenant_subspace(tenant_id).pack(&(
            METADATA_FAMILY,
            object_id.as_bytes().as_slice(),
            XATTR_FAMILY,
            name,
        ))
    }
}
