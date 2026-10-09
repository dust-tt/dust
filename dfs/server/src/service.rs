use dfs_protocol::{
    error::status,
    rpc::{
        ApplyRequest, AttrBatch, CreateSessionRequest, CreateTenantRequest, Empty, EntryPage,
        ErrorCode, FilesBatch, GrantPage, ListGrantsRequest, ListRequest, LookupRequest,
        OperationBatch, ReadData, ReadFilesRequest, ReadRequest, SearchRequest, SearchResults,
        Session, StatRequest, Tenant, UpdateGrantsRequest, ValidateRequest, ValidationBatch,
        dfs_server::Dfs,
    },
};
use tonic::{Request, Response, Status};

/// Every RPC answers UNSUPPORTED until its implementation lands.
pub struct DfsService;

fn unsupported<T>() -> Result<Response<T>, Status> {
    Err(status(ErrorCode::Unsupported))
}

#[tonic::async_trait]
impl Dfs for DfsService {
    async fn create_tenant(
        &self,
        _request: Request<CreateTenantRequest>,
    ) -> Result<Response<Tenant>, Status> {
        unsupported()
    }

    async fn create_session(
        &self,
        _request: Request<CreateSessionRequest>,
    ) -> Result<Response<Session>, Status> {
        unsupported()
    }

    async fn current_session(&self, _request: Request<Empty>) -> Result<Response<Session>, Status> {
        unsupported()
    }

    async fn close_session(&self, _request: Request<Empty>) -> Result<Response<Empty>, Status> {
        unsupported()
    }

    async fn list_grants(
        &self,
        _request: Request<ListGrantsRequest>,
    ) -> Result<Response<GrantPage>, Status> {
        unsupported()
    }

    async fn update_grants(
        &self,
        _request: Request<UpdateGrantsRequest>,
    ) -> Result<Response<Empty>, Status> {
        unsupported()
    }

    async fn stat(&self, _request: Request<StatRequest>) -> Result<Response<AttrBatch>, Status> {
        unsupported()
    }

    async fn lookup(
        &self,
        _request: Request<LookupRequest>,
    ) -> Result<Response<AttrBatch>, Status> {
        unsupported()
    }

    async fn list(&self, _request: Request<ListRequest>) -> Result<Response<EntryPage>, Status> {
        unsupported()
    }

    async fn read(&self, _request: Request<ReadRequest>) -> Result<Response<ReadData>, Status> {
        unsupported()
    }

    async fn read_files(
        &self,
        _request: Request<ReadFilesRequest>,
    ) -> Result<Response<FilesBatch>, Status> {
        unsupported()
    }

    async fn validate(
        &self,
        _request: Request<ValidateRequest>,
    ) -> Result<Response<ValidationBatch>, Status> {
        unsupported()
    }

    async fn apply(
        &self,
        _request: Request<ApplyRequest>,
    ) -> Result<Response<OperationBatch>, Status> {
        unsupported()
    }

    async fn search(
        &self,
        _request: Request<SearchRequest>,
    ) -> Result<Response<SearchResults>, Status> {
        unsupported()
    }
}
