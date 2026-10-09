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
use tonic::{Request, Response, Status};

use crate::storage::{fdb, resources::tenant::TenantResource};

mod errors;

/// RPCs without an implementation answer UNSUPPORTED.
#[allow(clippy::upper_case_acronyms)]
pub struct API;

#[tonic::async_trait]
impl Dfs for API {
    async fn create_tenant(
        &self,
        request: Request<CreateTenantRequest>,
    ) -> Result<Response<Tenant>, Status> {
        let CreateTenantRequest {
            tenant_id,
            root_grants,
        } = request.into_inner();
        if !root_grants.is_empty() {
            return Err(status(ErrorCode::InvalidInput));
        }
        // Unlike front's `makeNew`, the tenant is built before the transaction: FDB re-runs the body
        // on retry, and a fresh key and root per attempt would hide our own earlier commit.
        let (tenant, tenant_key) = TenantResource::new(tenant_id)?;
        let created = fdb::with_transaction(|tx| {
            let tenant = &tenant;
            async move { tenant.create(&tx).await }
        })
        .await?;
        if !created {
            return Err(status(ErrorCode::AlreadyExists));
        }
        Ok(Response::new(Tenant {
            tenant_id: tenant.tenant_id,
            root_id: tenant.root_id,
            tenant_key,
        }))
    }

    async fn create_session(
        &self,
        _request: Request<CreateSessionRequest>,
    ) -> Result<Response<Session>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn current_session(&self, _request: Request<Empty>) -> Result<Response<Session>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn revoke_session(
        &self,
        _request: Request<RevokeSessionRequest>,
    ) -> Result<Response<Empty>, Status> {
        // TODO(spolu): Authenticate the tenant API key before revoking a session in that tenant.
        Err(status(ErrorCode::Unsupported))
    }

    async fn refresh_session(&self, _request: Request<Empty>) -> Result<Response<Session>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn list_grants(
        &self,
        _request: Request<ListGrantsRequest>,
    ) -> Result<Response<GrantPage>, Status> {
        Err(status(ErrorCode::Unsupported))
    }

    async fn update_grants(
        &self,
        _request: Request<UpdateGrantsRequest>,
    ) -> Result<Response<Empty>, Status> {
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
