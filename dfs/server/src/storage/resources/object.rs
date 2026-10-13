use std::{
    collections::{HashMap, HashSet},
    fmt,
};

use dfs_protocol::{
    ObjectId,
    rpc::{AllowGrant, DenyGrant, Grant, GrantPage, GrantUpdate, ObjectKind, grant},
};
use foundationdb::{
    FdbBindingError, RangeOption, Transaction,
    tuple::{Subspace, pack, unpack},
};

use crate::{
    clock,
    storage::{
        self,
        resources::{SUBJECT_MAX_BYTES, keys::tenant_subspace, page, tenant::TenantResource},
    },
};

mod hints;
mod modes;
mod stat;
pub use hints::TreeHints;
pub use modes::Mode;

const FAMILY: &str = "object";
const METADATA_FAMILY: &str = "metadata";
const XATTR_FAMILY: &str = "xattr";
const INITIAL_VERSION: u64 = 1;
const EMPTY_SIZE_BYTES: u64 = 0;
const XATTR_NAME_MAX_BYTES: usize = 255;
const XATTRS_MAX_BYTES: usize = 32 * 1024;
const GRANT_FAMILY: &str = "object-grant";
const REVERSE_GRANT_FAMILY: &str = "grant-object";
const ALLOW: &str = "ALLOW";
const DENY: &str = "DENY";
const GRANTS_MAX_COUNT: usize = 512;
const GRANT_READ_MODE: u32 = 0o4;
const GRANT_WRITE_MODE: u32 = 0o2;
const GRANT_MODE_MASK: u32 = GRANT_READ_MODE | GRANT_WRITE_MODE;

#[derive(Debug)]
pub enum Error {
    TimestampGeneration,
    AlreadyExists,
    MissingMetadata,
    InvalidXattrName,
    XattrsTooLarge,
    InvalidId,
    NotFound,
    NotAuthorized,
    InvalidGrant,
    TooManyGrants,
    DuplicateGrant,
    InvalidGrantLimit,
    InvalidGrantCursor,
    InvalidStoredGrant,
    InvalidAncestry,
    UnsupportedKind,
    VersionOverflow,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TimestampGeneration => f.write_str("object timestamp generation failed"),
            Self::AlreadyExists => f.write_str("object already exists"),
            Self::MissingMetadata => f.write_str("object metadata missing"),
            Self::InvalidXattrName => f.write_str("invalid xattr name"),
            Self::XattrsTooLarge => f.write_str("xattrs exceed the size limit"),
            Self::InvalidId => f.write_str("invalid object ID"),
            Self::NotFound => f.write_str("object not found"),
            Self::NotAuthorized => f.write_str("object access not authorized"),
            Self::InvalidGrant => f.write_str("invalid grant"),
            Self::TooManyGrants => f.write_str("too many grants"),
            Self::DuplicateGrant => f.write_str("duplicate grant change"),
            Self::InvalidGrantLimit => f.write_str("invalid grant page limit"),
            Self::InvalidGrantCursor => f.write_str("invalid grant cursor"),
            Self::InvalidStoredGrant => f.write_str("invalid stored grant"),
            Self::InvalidAncestry => f.write_str("invalid object ancestry"),
            Self::UnsupportedKind => f.write_str("unsupported object kind"),
            Self::VersionOverflow => f.write_str("object version overflow"),
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
    pub grants_version: u64,
    pub metadata: Option<Metadata>,
}

pub struct Metadata {
    pub created_at_ms: u64,
    pub mime_type: Option<String>,
    pub xattrs: HashMap<String, Vec<u8>>,
}

type StoredAttributes = (
    Option<Vec<u8>>,
    String,
    i32,
    u64,
    Option<u64>,
    Option<u64>,
    Option<u64>,
    u64,
    u64,
    u64,
);

impl ObjectResource {
    /**
     * @cc [owner:spolu,label:backend;security] object-fetch-attributes
     * Fetch MUST derive tenant scope from the supplied TenantResource, read object attributes with
     * conflict tracking, and leave metadata unloaded. An invalid object ID MUST return InvalidId;
     * a missing object MUST return None. Stored-data decoding failures MUST propagate as storage
     * failures.
     */
    pub async fn fetch(
        tx: &Transaction,
        tenant: &TenantResource,
        object_id: &ObjectId,
    ) -> Result<Option<Self>, storage::Error<Error>> {
        Self::fetch_in_tenant(tx, &tenant.tenant_id, object_id).await
    }

    pub(crate) async fn fetch_in_tenant(
        tx: &Transaction,
        tenant_id: &str,
        object_id: &ObjectId,
    ) -> Result<Option<Self>, storage::Error<Error>> {
        object_id.validate().map_err(|_| Error::InvalidId)?;
        let Some(value) = tx
            .get(&Self::object_key(tenant_id, object_id), false)
            .await
            .map_err(FdbBindingError::from)?
        else {
            return Ok(None);
        };
        Self::from_value(tenant_id, object_id, &value).map(Some)
    }

    /**
     * @cc [owner:spolu,label:backend] object-load-metadata
     * Callers MUST fetch or create this object in the same transaction. Loading MUST read its base
     * metadata and all xattrs with conflict tracking, preserving exact names and values. Missing
     * base metadata or decoding failures MUST fail. Metadata MUST be assigned only after all reads
     * succeed.
     */
    pub async fn load_metadata(&mut self, tx: &Transaction) -> Result<(), storage::Error<Error>> {
        let value = tx
            .get(&Self::metadata_key(&self.tenant_id, &self.object_id), false)
            .await
            .map_err(FdbBindingError::from)?
            .ok_or(Error::MissingMetadata)?;
        let (created_at_ms, mime_type) = unpack(&value).map_err(FdbBindingError::PackError)?;
        let prefix = tenant_subspace(&self.tenant_id).subspace(&(
            METADATA_FAMILY,
            self.object_id.as_bytes().as_slice(),
            XATTR_FAMILY,
        ));
        let mut xattrs = HashMap::new();
        let mut next_range = Some(RangeOption::from(prefix.range()));
        let mut iteration = 1;
        while let Some(range) = next_range {
            let batch = tx
                .get_range(&range, iteration, false)
                .await
                .map_err(FdbBindingError::from)?;
            next_range = range.next_range(&batch);
            for entry in &batch {
                let (name,): (String,) = prefix
                    .unpack(entry.key())
                    .map_err(FdbBindingError::PackError)?;
                xattrs.insert(name, entry.value().to_vec());
            }
            iteration += 1;
        }
        self.metadata = Some(Metadata {
            created_at_ms,
            mime_type,
            xattrs,
        });
        Ok(())
    }

    fn from_value(
        tenant_id: &str,
        object_id: &ObjectId,
        value: &[u8],
    ) -> Result<Self, storage::Error<Error>> {
        let (
            parent_id,
            name,
            kind,
            size,
            atime_ms,
            mtime_ms,
            ctime_ms,
            attr_version,
            content_version,
            grants_version,
        ): StoredAttributes = unpack(value).map_err(FdbBindingError::PackError)?;
        Ok(Self {
            tenant_id: tenant_id.to_owned(),
            object_id: *object_id,
            parent_id: parent_id
                .map(|bytes| ObjectId::try_from(bytes.as_slice()))
                .transpose()
                .map_err(storage::Error::InvalidObjectId)?,
            name,
            kind: ObjectKind::try_from(kind)
                .map_err(|error| FdbBindingError::CustomError(Box::new(error)))?,
            size,
            atime_ms,
            mtime_ms,
            ctime_ms,
            attr_version,
            content_version,
            grants_version,
            metadata: None,
        })
    }

    /**
     * @cc [owner:spolu,label:backend] tenant-root-initial-state
     * A new root MUST use the tenant's root ID and be an empty directory with no parent, MIME type,
     * or xattrs, and an empty name. All versions MUST start at 1. Creation, access, modification, and
     * change times MUST be initialized to the same server timestamp.
     */
    pub fn new_root(tenant: &TenantResource) -> Result<Self, Error> {
        let now_ms = clock::now_ms().map_err(|_| Error::TimestampGeneration)?;
        Ok(Self::new(
            &tenant.tenant_id,
            tenant.root_id,
            None,
            String::new(),
            ObjectKind::Directory,
            None,
            HashMap::new(),
            now_ms,
        ))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn new(
        tenant_id: &str,
        object_id: ObjectId,
        parent_id: Option<ObjectId>,
        name: String,
        kind: ObjectKind,
        mime_type: Option<String>,
        xattrs: HashMap<String, Vec<u8>>,
        now_ms: u64,
    ) -> Self {
        Self {
            tenant_id: tenant_id.to_owned(),
            object_id,
            parent_id,
            name,
            kind,
            size: EMPTY_SIZE_BYTES,
            atime_ms: Some(now_ms),
            mtime_ms: Some(now_ms),
            ctime_ms: Some(now_ms),
            attr_version: INITIAL_VERSION,
            content_version: INITIAL_VERSION,
            grants_version: INITIAL_VERSION,
            metadata: Some(Metadata {
                created_at_ms: now_ms,
                mime_type,
                xattrs,
            }),
        }
    }

    /**
     * @cc [owner:spolu,label:backend;error-handling] object-create-atomicity
     * Creation MUST write attributes, metadata, xattrs, and grants in the caller's transaction. An
     * object ID in the same tenant already holding exactly this object's attributes MUST succeed
     * without writes so a retry can recognize its own commit; any other occupant MUST return
     * AlreadyExists before staging any writes, preserving the existing object and metadata. Missing
     * metadata or invalid xattrs MUST fail before staging any writes. Initial grants MUST be
     * validated and deduplicated, with at most 512 distinct values, before staging writes.
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
    pub async fn create(
        &self,
        tx: &Transaction,
        grants: &[Grant],
    ) -> Result<(), storage::Error<Error>> {
        let attributes = self.packed_attributes();
        let key = Self::object_key(&self.tenant_id, &self.object_id);
        let existing = tx.get(&key, false).await.map_err(FdbBindingError::from)?;
        if let Some(existing) = existing {
            // A retry after an unknown commit result finds our own record.
            return if existing.as_ref() == attributes.as_slice() {
                Ok(())
            } else {
                Err(Error::AlreadyExists.into())
            };
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

        let unique_grants: HashSet<&Grant> = grants.iter().collect();
        if unique_grants.len() > GRANTS_MAX_COUNT {
            return Err(Error::TooManyGrants.into());
        }
        for grant in &unique_grants {
            self.grant_keys(grant)?;
        }

        tx.set(&key, &attributes);
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
        for grant in unique_grants {
            self.write_grant(tx, grant, false)?;
        }
        Ok(())
    }

    fn save_attributes(&self, tx: &Transaction) {
        tx.set(
            &Self::object_key(&self.tenant_id, &self.object_id),
            &self.packed_attributes(),
        );
    }

    fn packed_attributes(&self) -> Vec<u8> {
        let parent_id = self.parent_id.as_ref().map(|id| id.as_bytes().as_slice());
        pack(&(
            parent_id,
            self.name.as_str(),
            i32::from(self.kind),
            self.size,
            self.atime_ms,
            self.mtime_ms,
            self.ctime_ms,
            self.attr_version,
            self.content_version,
            self.grants_version,
        ))
    }

    pub fn record_content_change(&mut self, tx: &Transaction, now_ms: u64) -> Result<(), Error> {
        self.content_version = self
            .content_version
            .checked_add(1)
            .ok_or(Error::VersionOverflow)?;
        self.mtime_ms = Some(now_ms);
        self.record_attr_change(tx, now_ms)
    }

    pub fn record_attr_change(&mut self, tx: &Transaction, now_ms: u64) -> Result<(), Error> {
        self.attr_version = self
            .attr_version
            .checked_add(1)
            .ok_or(Error::VersionOverflow)?;
        self.ctime_ms = Some(now_ms);
        self.save_attributes(tx);
        Ok(())
    }

    /**
     * @cc [owner:spolu,label:backend;security] object-grant-pagination
     * Callers MUST fetch or create this object in the same transaction. Listing MUST return only
     * its explicit grants, ordered by ALLOW before DENY, then subject bytes and numeric mode.
     * Limits MUST be 1-512. Cursors MUST be exclusive and scoped to this tenant and object;
     * next_after MUST be absent when there are no further entries in the transaction's view.
     */
    pub async fn list_grants(
        &self,
        tx: &Transaction,
        after: Option<&str>,
        limit: u32,
    ) -> Result<GrantPage, storage::Error<Error>> {
        let limit = usize::try_from(limit).map_err(|_| Error::InvalidGrantLimit)?;
        if limit == 0 || limit > GRANTS_MAX_COUNT {
            return Err(Error::InvalidGrantLimit.into());
        }
        let subspace = self.grant_subspace();
        let after = after
            .map(|after| {
                page::decode_cursor(&subspace, after, |key| self.grant_from_key(key).is_ok())
                    .ok_or(Error::InvalidGrantCursor)
            })
            .transpose()?;
        let page = page::read_page(tx, &subspace, after, limit).await?;
        let grants = page
            .entries
            .iter()
            .map(|(key, _)| self.grant_from_key(key))
            .collect::<Result<_, _>>()?;
        Ok(GrantPage {
            grants,
            next_after: page.next_after,
        })
    }

    /**
     * @cc [owner:spolu,label:backend;security] object-grant-updates
     * Callers MUST fetch or create this object in the same transaction. Updates MUST reject more
     * than 512 changes, invalid grants, or repeated complete grant values before staging writes.
     * ALLOW forward and reverse entries MUST change together; DENY MUST have no reverse entry.
     * Attaching an existing grant or removing an absent grant MUST leave the grant set unchanged.
     * Unmentioned grants, non-version attributes, metadata, attr_version, and content_version MUST
     * remain unchanged.
     */
    /**
     * @cc [owner:spolu,label:backend] object-grants-version
     * Each successful update MUST increment only this object's grants_version once, atomically
     * with the grants, including empty or no-op updates. Initial grants MUST NOT advance it.
     * Overflow MUST fail before staging writes. A retry after an unknown commit result MAY
     * increment it again; versions MUST NOT wrap or reset.
     */
    pub fn update_grants(
        &mut self,
        tx: &Transaction,
        changes: &[GrantUpdate],
    ) -> Result<(), storage::Error<Error>> {
        if changes.len() > GRANTS_MAX_COUNT {
            return Err(Error::TooManyGrants.into());
        }
        let mut seen = HashSet::new();
        for change in changes {
            self.grant_keys(&change.grant)?;
            if !seen.insert(&change.grant) {
                return Err(Error::DuplicateGrant.into());
            }
        }
        let grants_version = self
            .grants_version
            .checked_add(1)
            .ok_or(Error::VersionOverflow)?;
        for change in changes {
            self.write_grant(tx, &change.grant, change.remove)?;
        }
        self.grants_version = grants_version;
        self.save_attributes(tx);
        Ok(())
    }

    fn write_grant(&self, tx: &Transaction, grant: &Grant, remove: bool) -> Result<(), Error> {
        let (forward, reverse) = self.grant_keys(grant)?;
        for key in std::iter::once(forward.as_slice()).chain(reverse.as_deref()) {
            if remove {
                tx.clear(key);
            } else {
                tx.set(key, &[]);
            }
        }
        Ok(())
    }

    /**
     * @cc [owner:spolu,label:backend] object-grant-identity
     * Grants MUST select one variant and use only mode bits 0o6, including zero. ALLOW subjects
     * MUST contain 1-1024 UTF-8 bytes, preserved exactly. Invalid grants MUST return InvalidGrant.
     * Keys MUST preserve the complete grant identity, including distinct modes for one subject.
     * Reverse ALLOW keys MUST place the ALLOW tag before the subject.
     */
    fn grant_keys(&self, grant: &Grant) -> Result<(Vec<u8>, Option<Vec<u8>>), Error> {
        let prefix = self.grant_subspace();
        match &grant.kind {
            Some(grant::Kind::Allow(AllowGrant { subject, mode }))
                if !subject.is_empty()
                    && subject.len() <= SUBJECT_MAX_BYTES
                    && mode & !GRANT_MODE_MASK == 0 =>
            {
                Ok((
                    prefix.pack(&(ALLOW, subject.as_str(), *mode)),
                    Some(tenant_subspace(&self.tenant_id).pack(&(
                        REVERSE_GRANT_FAMILY,
                        ALLOW,
                        subject.as_str(),
                        self.object_id.as_bytes().as_slice(),
                        *mode,
                    ))),
                ))
            }
            Some(grant::Kind::Deny(DenyGrant { mode })) if mode & !GRANT_MODE_MASK == 0 => {
                Ok((prefix.pack(&(DENY, *mode)), None))
            }
            _ => Err(Error::InvalidGrant),
        }
    }

    fn grant_from_key(&self, key: &[u8]) -> Result<Grant, Error> {
        let prefix = self.grant_subspace();
        let allow = prefix.subspace(&ALLOW);
        let kind = if allow.is_start_of(key) {
            let (subject, mode) = allow.unpack(key).map_err(|_| Error::InvalidStoredGrant)?;
            grant::Kind::Allow(AllowGrant { subject, mode })
        } else {
            let mode = prefix
                .subspace(&DENY)
                .unpack(key)
                .map_err(|_| Error::InvalidStoredGrant)?;
            grant::Kind::Deny(DenyGrant { mode })
        };
        let grant = Grant { kind: Some(kind) };
        if self
            .grant_keys(&grant)
            .map_err(|_| Error::InvalidStoredGrant)?
            .0
            != key
        {
            return Err(Error::InvalidStoredGrant);
        }
        Ok(grant)
    }

    fn grant_subspace(&self) -> Subspace {
        tenant_subspace(&self.tenant_id)
            .subspace(&(GRANT_FAMILY, self.object_id.as_bytes().as_slice()))
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
