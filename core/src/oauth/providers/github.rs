use crate::oauth::connection::{
    Connection, ConnectionProvider, FinalizeResult, Provider, RefreshResult,
};
use anyhow::Result;
use async_trait::async_trait;

pub struct GithubConnectionProvider {}

impl GithubConnectionProvider {
    pub fn new() -> Self {
        GithubConnectionProvider {}
    }
}

#[async_trait]
impl Provider for GithubConnectionProvider {
    fn id(&self) -> ConnectionProvider {
        ConnectionProvider::Github
    }

    async fn finalize(&self, connection: &Connection, code: &str) -> Result<FinalizeResult> {
        unimplemented!();
    }

    async fn refresh(&self, connection: &Connection) -> Result<RefreshResult> {
        unimplemented!();
    }
}
