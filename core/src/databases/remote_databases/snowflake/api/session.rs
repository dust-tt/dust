use std::time::Duration;

use super::{
    error::Result,
    query::{QueryExecutor, QueryRequest},
    row::SnowflakeRow,
};

pub struct SnowflakeSession {
    pub http: reqwest::Client,
    pub account: String,
    pub session_token: String,
    pub timeout: Option<Duration>,
}

impl SnowflakeSession {
    pub async fn query<Q: Into<QueryRequest>>(&self, request: Q) -> Result<Vec<SnowflakeRow>> {
        let executor = QueryExecutor::create(self, request).await?;
        executor.fetch_all().await
    }

    pub async fn execute<Q: Into<QueryRequest>>(&self, request: Q) -> Result<QueryExecutor> {
        QueryExecutor::create(self, request).await
    }
}
