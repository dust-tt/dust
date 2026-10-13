use std::collections::HashMap;

use dfs_protocol::{
    READ_FILES_MAX_OBJECTS, STAT_MAX_REFERENCES,
    error::status,
    rpc::{
        ApplyRequest, Attr, AttrBatch, AttrResult, CreateSessionRequest, CreateTenantRequest,
        Empty, EntryPage, ErrorCode, ErrorDetails, FileResult, FilesBatch, GrantPage,
        ListGrantsRequest, ListRequest, LookupRequest, OperationBatch, ReadData, ReadFilesRequest,
        ReadRequest, RevokeSessionRequest, SearchRequest, SearchResults, Session, StatRequest,
        Tenant, UpdateGrantsRequest, dfs_server::Dfs,
    },
};
use prost::Message;
use tokio::sync::RwLock;
use tonic::{Request, Response, Status};

use crate::{
    auth::KeyHash,
    storage::{
        self, fdb,
        resources::{
            file::FileResource,
            object::{self, ObjectResource},
            session::SessionResource,
            tenant::TenantResource,
        },
    },
};

pub(crate) mod auth;
mod errors;

// Reserve space for each result's attributes, error, and protobuf framing, without metadata.
const READ_FILES_RESULT_OVERHEAD_BYTES: usize = 512;

#[cfg(test)]
#[path = "../tests/api/read_files_budget.rs"]
mod read_files_budget_tests;

/// RPCs without an implementation answer UNSUPPORTED after their implemented authentication checks.
#[allow(clippy::upper_case_acronyms)]
pub struct API {
    master_key_hash: KeyHash,
    tenant_key_cache: RwLock<HashMap<KeyHash, auth::CachedTenant>>,
    session_key_cache: RwLock<HashMap<KeyHash, auth::CachedSession>>,
}

/**
 * @cc [owner:pmilliotte,label:architecture] api-fdb-access-thru-resources
 * Handlers MUST reach FDB only by calling resource methods inside `fdb::with_transaction`. They
 * MUST NOT use `foundationdb` APIs or `fdb::database()` directly.
 */
#[tonic::async_trait]
impl Dfs for API {
    async fn create_tenant(
        &self,
        request: Request<CreateTenantRequest>,
    ) -> Result<Response<Tenant>, Status> {
        self.require_master(&request)?;
        let CreateTenantRequest {
            tenant_id,
            root_grants,
        } = request.into_inner();
        // Call `new` before the transaction because FDB may retry its body. Keeping the same key
        // and root across attempts lets us recognize our own commit if its outcome was unknown.
        let (tenant, tenant_key) = TenantResource::new(tenant_id)?;
        let root = ObjectResource::new_root(&tenant)?;
        fdb::with_transaction(|tx| {
            let tenant = &tenant;
            let root = &root;
            let root_grants = &root_grants;
            async move {
                tenant.create(&tx).await?;
                root.create(&tx, root_grants).await?;
                Ok::<_, storage::Error<Status>>(())
            }
        })
        .await?;
        Ok(Response::new(Tenant {
            tenant_id: tenant.tenant_id,
            root_id: tenant.root_id,
            tenant_key,
        }))
    }

    /**
     * @cc [owner:spolu,label:api;security] create-session-authentication
     * CreateSession MUST authenticate a tenant key before validating or persisting a session.
     * The session's tenant MUST come exclusively from that authentication.
     */
    async fn create_session(
        &self,
        request: Request<CreateSessionRequest>,
    ) -> Result<Response<Session>, Status> {
        let tenant = self.require_tenant(&request).await?;
        let CreateSessionRequest { subjects } = request.into_inner();
        // Construct before the transaction so retries retain the session's ID, key, and expiry.
        let (session, session_key) = SessionResource::new(&tenant, subjects)?;
        fdb::with_transaction(|tx| {
            let session = &session;
            async move { session.create(&tx).await }
        })
        .await?;
        Ok(Response::new(Session {
            id: session.session_id,
            tenant_id: session.tenant.tenant_id,
            subjects: session.subjects.into_iter().collect(),
            session_key,
            expires_at: session.expires_at_ms,
        }))
    }

    async fn current_session(&self, request: Request<Empty>) -> Result<Response<Session>, Status> {
        let session = self.require_session(&request).await?;
        Ok(Response::new(Session::from(session.as_ref())))
    }

    /**
     * @cc [owner:spolu,label:api;security] revoke-session-authentication
     * Revocation MUST authenticate a tenant key before validating the request and MUST derive the
     * tenant exclusively from that authentication. Local cache eviction MUST follow the FDB commit.
     */
    async fn revoke_session(
        &self,
        request: Request<RevokeSessionRequest>,
    ) -> Result<Response<Empty>, Status> {
        let tenant = self.require_tenant(&request).await?;
        let session_id = request.into_inner().session_id;
        let key_hash = fdb::with_transaction(|tx| {
            let tenant = tenant.as_ref();
            let session_id = &session_id;
            async move { SessionResource::revoke(&tx, tenant, session_id).await }
        })
        .await?;
        self.session_key_cache.write().await.remove(&key_hash);
        Ok(Response::new(Empty {}))
    }

    /**
     * @cc [owner:spolu,label:api;security] refresh-session-bypasses-cache
     * Refresh MUST authenticate and extend expiry in one FDB transaction. Cached authentication
     * MUST NOT authorize refresh. The local cache entry MUST be evicted after a successful commit.
     */
    async fn refresh_session(&self, request: Request<Empty>) -> Result<Response<Session>, Status> {
        let key_hash = auth::credentials(&request)?;
        let session =
            fdb::with_transaction(
                |tx| async move { SessionResource::refresh(&tx, &key_hash).await },
            )
            .await?;
        self.session_key_cache.write().await.remove(&key_hash);
        Ok(Response::new(Session::from(&session)))
    }

    async fn list_grants(
        &self,
        request: Request<ListGrantsRequest>,
    ) -> Result<Response<GrantPage>, Status> {
        let tenant = self.require_tenant(&request).await?;
        let ListGrantsRequest {
            object_id,
            after,
            limit,
        } = request.into_inner();
        let page = fdb::with_transaction(|tx| {
            let tenant = tenant.as_ref();
            let after = &after;
            async move {
                let object = ObjectResource::fetch(&tx, tenant, &object_id)
                    .await?
                    .ok_or(object::Error::NotFound)?;
                object.list_grants(&tx, after.as_deref(), limit).await
            }
        })
        .await?;
        Ok(Response::new(page))
    }

    async fn update_grants(
        &self,
        request: Request<UpdateGrantsRequest>,
    ) -> Result<Response<Empty>, Status> {
        let tenant = self.require_tenant(&request).await?;
        let UpdateGrantsRequest { object_id, changes } = request.into_inner();
        fdb::with_transaction(|tx| {
            let tenant = tenant.as_ref();
            let changes = &changes;
            async move {
                let mut object = ObjectResource::fetch(&tx, tenant, &object_id)
                    .await?
                    .ok_or(object::Error::NotFound)?;
                object.update_grants(&tx, changes)
            }
        })
        .await?;
        Ok(Response::new(Empty {}))
    }

    /**
     * @cc [owner:spolu,label:api;security] stat-batch-results
     * Stat MUST accept 1-4096 valid references and preserve their order and duplicates. Missing and
     * unreadable real objects MUST return per-result NOT_FOUND without dropping other results.
     * Each result MUST contain exactly one of object or error.
     * Requested metadata MUST be returned on every successful result. Responses larger than the
     * encoded message budget MUST fail with CAPACITY instead of dropping metadata or results.
     */
    async fn stat(&self, request: Request<StatRequest>) -> Result<Response<AttrBatch>, Status> {
        let session = self.require_session(&request).await?;
        let StatRequest {
            object_ids,
            include_metadata,
        } = request.into_inner();
        if object_ids.is_empty() || object_ids.len() > STAT_MAX_REFERENCES {
            return Err(status(ErrorCode::InvalidInput));
        }
        let include_metadata = include_metadata.unwrap_or(false);
        let attributes = fdb::with_transaction(|tx| {
            let session = session.as_ref();
            let object_ids = &object_ids;
            async move { ObjectResource::stat(&tx, session, object_ids, include_metadata).await }
        })
        .await?;
        Ok(Response::new(attr_batch(attributes)?))
    }

    async fn lookup(&self, request: Request<LookupRequest>) -> Result<Response<AttrBatch>, Status> {
        self.require_session(&request).await?;
        Err(status(ErrorCode::Unsupported))
    }

    async fn list(&self, request: Request<ListRequest>) -> Result<Response<EntryPage>, Status> {
        self.require_session(&request).await?;
        Err(status(ErrorCode::Unsupported))
    }

    /**
     * @cc [owner:spolu,label:api;security] file-read-authorized-snapshot
     * Read MUST authorize the session through the object's effective mode before reading contents
     * or revealing its kind. Missing and unreadable objects MUST return NOT_FOUND. Bytes and
     * attributes MUST come from the same transaction, without optional metadata. Readable
     * directories MUST return IS_DIRECTORY. Responses MUST fit the encoded message budget.
     */
    async fn read(&self, request: Request<ReadRequest>) -> Result<Response<ReadData>, Status> {
        let session = self.require_session(&request).await?;
        let ReadRequest {
            object_id,
            offset,
            length,
        } = request.into_inner();
        let response = fdb::with_transaction(|tx| {
            let session = session.as_ref();
            async move {
                let (file, object) =
                    FileResource::fetch_for_session(&tx, session, &object_id).await?;
                file.read(&tx, offset, length)
                    .await
                    .map(|data| ReadData { data, object })
            }
        })
        .await?;
        if response.encoded_len() > crate::MAX_MESSAGE_SIZE_BYTES {
            return Err(status(ErrorCode::Capacity));
        }
        Ok(Response::new(response))
    }

    /**
     * @cc [owner:spolu,label:api;security] read-files-results
     * ReadFiles MUST accept 1-256 IDs and preserve input order and duplicates. Each result MUST
     * contain either whole-file data and attributes or ErrorDetails. Unreadable objects MUST be
     * concealed as NOT_FOUND through the file resource's shared error mapping.
     */
    /**
     * @cc [owner:spolu,label:api;performance] read-files-budget
     * The data budget passed to the resource MUST reserve enough space for every result's
     * attributes, errors, and protobuf framing to keep the encoded batch within 4 MiB.
     * A conservative overhead allowance MAY reject files that an exact encoded budget would fit.
     */
    async fn read_files(
        &self,
        request: Request<ReadFilesRequest>,
    ) -> Result<Response<FilesBatch>, Status> {
        let session = self.require_session(&request).await?;
        let ReadFilesRequest { object_ids } = request.into_inner();
        if object_ids.is_empty() || object_ids.len() > READ_FILES_MAX_OBJECTS {
            return Err(status(ErrorCode::InvalidInput));
        }
        let max_bytes =
            crate::MAX_MESSAGE_SIZE_BYTES - object_ids.len() * READ_FILES_RESULT_OVERHEAD_BYTES;
        let results = fdb::with_transaction(|tx| {
            let session = session.as_ref();
            let object_ids = &object_ids;
            async move {
                FileResource::read_batch_for_session(&tx, session, object_ids, max_bytes).await
            }
        })
        .await?;
        let response = FilesBatch {
            results: object_ids
                .into_iter()
                .zip(results)
                .map(|(object_id, result)| match result {
                    Ok((object, data)) => FileResult {
                        object_id,
                        object: Some(object),
                        data: Some(data),
                        error: None,
                    },
                    Err(error) => FileResult {
                        object_id,
                        object: None,
                        data: None,
                        error: Some(error.into()),
                    },
                })
                .collect(),
        };
        if response.encoded_len() > crate::MAX_MESSAGE_SIZE_BYTES {
            return Err(status(ErrorCode::Capacity));
        }
        Ok(Response::new(response))
    }

    async fn apply(
        &self,
        request: Request<ApplyRequest>,
    ) -> Result<Response<OperationBatch>, Status> {
        self.require_session(&request).await?;
        Err(status(ErrorCode::Unsupported))
    }

    async fn search(
        &self,
        request: Request<SearchRequest>,
    ) -> Result<Response<SearchResults>, Status> {
        self.require_session(&request).await?;
        Err(status(ErrorCode::Unsupported))
    }
}

fn attr_batch<E: Into<ErrorDetails>>(results: Vec<Result<Attr, E>>) -> Result<AttrBatch, Status> {
    let results = results
        .into_iter()
        .map(|result| match result {
            Ok(object) => AttrResult {
                object: Some(object),
                error: None,
            },
            Err(error) => AttrResult {
                object: None,
                error: Some(error.into()),
            },
        })
        .collect();
    let batch = AttrBatch { results };
    if batch.encoded_len() > crate::MAX_MESSAGE_SIZE_BYTES {
        return Err(status(ErrorCode::Capacity));
    }
    Ok(batch)
}

/**
 * @cc [owner:spolu,label:api;security] stored-session-response-key
 * Responses built from stored session resources MUST leave session_key empty. Only CreateSession
 * may return the newly generated bearer key.
 */
impl From<&SessionResource> for Session {
    fn from(session: &SessionResource) -> Self {
        Self {
            id: session.session_id.clone(),
            tenant_id: session.tenant.tenant_id.clone(),
            subjects: session.subjects.iter().cloned().collect(),
            session_key: String::new(),
            expires_at: session.expires_at_ms,
        }
    }
}
