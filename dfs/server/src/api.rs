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
use foundationdb::Database;
use tonic::{Request, Response, Status};

/// Every RPC answers UNSUPPORTED until its implementation lands.
#[allow(clippy::upper_case_acronyms)]
pub struct API {
    pub database: Database,
}

#[tonic::async_trait]
impl Dfs for API {
    async fn create_tenant(
        &self,
        _request: Request<CreateTenantRequest>,
    ) -> Result<Response<Tenant>, Status> {
        Err(status(ErrorCode::Unsupported))
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
