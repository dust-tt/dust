use anyhow::{anyhow, Result};
use hyper::{body::Bytes, Body, Client, Request};
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use urlencoding::encode;

use crate::{
    databases::database::{QueryResult, Table},
    utils,
};

pub const HEARTBEAT_INTERVAL_MS: u64 = 3_000;

#[derive(Debug, Serialize, Clone)]
pub struct SqliteWorker {
    last_heartbeat: u64,
    url: String,
}

#[derive(Debug, Error)]
pub enum SqliteWorkerError {
    #[error("SqliteWorkerError Server error (uri={0}, code={1}, status={2})")]
    ServerError(String, String, u16),
    #[error("SqliteWorkerError Unexpected server error (uri={0}, status={1}): {2}")]
    UnexpectedServerError(String, u16, String),
    #[error("SqliteWorkerError Body parsing error (uri={1}, status={2}): {0}")]
    BodyParsingError(serde_json::Error, String, u16),
    #[error("SqliteWorkerError HyperError: {0}")]
    HyperError(#[from] hyper::Error),
    #[error("SqliteWorkerError Unexpected error: {0}")]
    UnexpectedError(anyhow::Error),
}

impl From<hyper::http::Error> for SqliteWorkerError {
    fn from(e: hyper::http::Error) -> Self {
        SqliteWorkerError::UnexpectedError(anyhow!(e))
    }
}

impl From<serde_json::Error> for SqliteWorkerError {
    fn from(e: serde_json::Error) -> Self {
        SqliteWorkerError::UnexpectedError(anyhow!(e))
    }
}

impl SqliteWorker {
    pub fn new(url: String, last_heartbeat: u64) -> Self {
        Self {
            last_heartbeat: last_heartbeat,
            url,
        }
    }

    pub fn is_alive(&self) -> bool {
        let now = utils::now();
        let elapsed = now - self.last_heartbeat;

        elapsed < HEARTBEAT_INTERVAL_MS
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub async fn execute_query(
        &self,
        database_unique_id: &str,
        tables: &Vec<Table>,
        query: &str,
    ) -> Result<Vec<QueryResult>, SqliteWorkerError> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("POST")
            .uri(format!(
                "{}/databases/{}",
                worker_url,
                encode(database_unique_id)
            ))
            .header("Content-Type", "application/json")
            .body(Body::from(
                json!({
                    "tables": tables,
                    "query": query,
                })
                .to_string(),
            ))?;

        let body_bytes = get_response_body(req).await?;

        #[derive(Deserialize)]
        struct ExecuteQueryResponseBody {
            error: Option<String>,
            response: Option<Vec<QueryResult>>,
        }

        let body: ExecuteQueryResponseBody = serde_json::from_slice(&body_bytes)?;

        match body.error {
            Some(e) => Err(SqliteWorkerError::UnexpectedError(anyhow!(e)))?,
            None => match body.response {
                Some(r) => Ok(r),
                None => Err(SqliteWorkerError::UnexpectedError(anyhow!(
                    "No response in body"
                )))?,
            },
        }
    }

    pub async fn invalidate_database(
        &self,
        database_unique_id: &str,
    ) -> Result<(), SqliteWorkerError> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!("{}/databases/{}", worker_url, database_unique_id))
            .body(Body::from(""))?;

        let _ = get_response_body(req).await?;

        Ok(())
    }

    pub async fn expire_all(&self) -> Result<(), SqliteWorkerError> {
        let worker_url = self.url();

        let req = Request::builder()
            .method("DELETE")
            .uri(format!("{}/databases", worker_url))
            .body(Body::from(""))?;

        let _ = get_response_body(req).await?;

        Ok(())
    }
}

async fn get_response_body(req: hyper::Request<hyper::Body>) -> Result<Bytes, SqliteWorkerError> {
    let uri = req.uri().to_string();
    let res = Client::new().request(req).await?;

    let status = res.status().as_u16();
    let body = hyper::body::to_bytes(res.into_body()).await?;

    match status {
        200 => Ok(body),
        s => {
            let body_json: serde_json::Value = serde_json::from_slice(&body)
                .map_err(|e| SqliteWorkerError::BodyParsingError(e, uri.clone(), s))?;

            let error = body_json.get("error");
            let error_code = match error {
                Some(e) => e
                    .get("code")
                    .map(|c| c.as_str())
                    .flatten()
                    .map(|s| s.to_string()),
                None => None,
            };
            match error_code {
                Some(code) => Err(SqliteWorkerError::ServerError(uri, code.to_string(), s))?,
                None => Err(SqliteWorkerError::UnexpectedServerError(
                    uri,
                    s,
                    format!("No error code in response: {}", body_json.to_string()),
                ))?,
            }
        }
    }
}
