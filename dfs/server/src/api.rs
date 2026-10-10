use std::{collections::HashMap, sync::Arc};

use dfs_protocol::{
    error::status,
    rpc::{
        ApplyRequest, AttrBatch, CreateSessionRequest, CreateTenantRequest, Empty, EntryPage,
        ErrorCode, FilesBatch, GrantPage, ListGrantsRequest, ListRequest, LookupRequest,
        OperationBatch, ReadData, ReadFilesRequest, ReadRequest, RevokeSessionRequest,
        SearchRequest, SearchResults, Session, StatRequest, Tenant, UpdateGrantsRequest,
        ValidateRequest, ValidationBatch, dfs_server::Dfs,
    },
};
use tokio::sync::RwLock;
use tonic::{Request, Response, Status};

use crate::{
    auth::KeyHash,
    storage::{fdb, resources::tenant::TenantResource},
};

pub(crate) mod auth;
mod errors;

/// RPCs without an implementation answer UNSUPPORTED after their implemented authentication checks.
#[allow(clippy::upper_case_acronyms)]
pub struct API {
    master_key_hash: KeyHash,
    tenant_key_cache: RwLock<HashMap<KeyHash, Arc<TenantResource>>>,
}

/// @cc [owner:pmilliotte,label:architecture] api-fdb-access-thru-resources
/// Handlers MUST reach FDB only by calling resource methods inside `fdb::with_transaction`. They
/// MUST NOT use `foundationdb` APIs or `fdb::database()` directly.
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
        if !root_grants.is_empty() {
            return Err(status(ErrorCode::InvalidInput));
        }
        // Call `new` before the transaction because FDB may retry its body. Keeping the same key and
        // root across attempts lets us recognize our own commit if its outcome was unknown.
        let (tenant, tenant_key) = TenantResource::new(tenant_id)?;
        fdb::with_transaction(|tx| {
            let tenant = &tenant;
            async move { tenant.create(&tx).await }
        })
        .await?;
        Ok(Response::new(Tenant {
            tenant_id: tenant.tenant_id,
            root_id: tenant.root_id,
            tenant_key,
        }))
    }

    async fn create_session(
        &self,
        request: Request<CreateSessionRequest>,
    ) -> Result<Response<Session>, Status> {
        self.require_tenant(&request).await?;
        Err(status(ErrorCode::Unsupported))
    }

    async fn current_session(&self, _request: Request<Empty>) -> Result<Response<Session>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn revoke_session(
        &self,
        request: Request<RevokeSessionRequest>,
    ) -> Result<Response<Empty>, Status> {
        self.require_tenant(&request).await?;
        Err(status(ErrorCode::Unsupported))
    }

    async fn refresh_session(&self, _request: Request<Empty>) -> Result<Response<Session>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn list_grants(
        &self,
        request: Request<ListGrantsRequest>,
    ) -> Result<Response<GrantPage>, Status> {
        self.require_tenant(&request).await?;
        Err(status(ErrorCode::Unsupported))
    }

    async fn update_grants(
        &self,
        request: Request<UpdateGrantsRequest>,
    ) -> Result<Response<Empty>, Status> {
        self.require_tenant(&request).await?;
        Err(status(ErrorCode::Unsupported))
    }

    async fn stat(&self, _request: Request<StatRequest>) -> Result<Response<AttrBatch>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn lookup(
        &self,
        _request: Request<LookupRequest>,
    ) -> Result<Response<AttrBatch>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn list(&self, _request: Request<ListRequest>) -> Result<Response<EntryPage>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn read(&self, _request: Request<ReadRequest>) -> Result<Response<ReadData>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn read_files(
        &self,
        _request: Request<ReadFilesRequest>,
    ) -> Result<Response<FilesBatch>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn validate(
        &self,
        _request: Request<ValidateRequest>,
    ) -> Result<Response<ValidationBatch>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn apply(
        &self,
        _request: Request<ApplyRequest>,
    ) -> Result<Response<OperationBatch>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn search(
        &self,
        _request: Request<SearchRequest>,
    ) -> Result<Response<SearchResults>, Status> {
        Err(status(ErrorCode::Unsupported))
    }
}
