use anyhow::{anyhow, Result};
use hyper::body::Bytes;
use reqwest::{RequestBuilder, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use urlencoding::encode;

use crate::{
    databases::{database::QueryResult, table::LocalTable},
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
    #[error("SqliteWorkerError Too many result rows")]
    TooManyResultRows,
    #[error("SqliteWorkerError Query execution error: {0}")]
    QueryExecutionError(String),
    #[error("SqliteWorkerError Server error (uri={0}, code={1}, status={2}, message={3:?})")]
    ServerError(String, String, u16, Option<String>),
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
            last_heartbeat,
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
        tables: &Vec<LocalTable>,
        query: &str,
    ) -> Result<Vec<QueryResult>, SqliteWorkerError> {
        let worker_url = self.url();
        let uri = format!("{}/databases/{}", worker_url, encode(database_unique_id));

        let req = reqwest::Client::new()
            .post(&uri)
            .header("Content-Type", "application/json")
            .json(&json!({
                "tables": tables.iter().map(|lt| &lt.table).collect::<Vec<_>>(),
                "query": query,
            }));

        let body_bytes = get_response_body(req, &uri).await?;

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
        let uri = format!("{}/databases/{}", worker_url, encode(database_unique_id));

        let req = reqwest::Client::new().delete(&uri);

        let _ = get_response_body(req, &uri).await?;

        Ok(())
    }

    pub async fn expire_all(&self) -> Result<(), SqliteWorkerError> {
        let worker_url = self.url();
        let uri = format!("{}/databases", worker_url);

        let req = reqwest::Client::new().delete(&uri);

        let _ = get_response_body(req, &uri).await?;

        Ok(())
    }
}

async fn get_response_body(req: RequestBuilder, uri: &str) -> Result<Bytes, SqliteWorkerError> {
    let res = req
        .send()
        .await
        .map_err(|e| SqliteWorkerError::UnexpectedError(anyhow!(e)))?;

    let status = res.status();
    let body = res
        .bytes()
        .await
        .map_err(|e| SqliteWorkerError::UnexpectedError(anyhow!(e)))?;

    match status {
        StatusCode::OK => Ok(body),
        s => {
            let body_json: serde_json::Value = serde_json::from_slice(&body)
                .map_err(|e| SqliteWorkerError::BodyParsingError(e, uri.to_string(), s.into()))?;

            let error = body_json.get("error");
            let error_code = match error {
                Some(e) => e
                    .get("code")
                    .map(|c| c.as_str())
                    .flatten()
                    .map(|s| s.to_string()),
                None => None,
            };
            let error_message = match error {
                Some(e) => e
                    .get("message")
                    .map(|m| m.as_str())
                    .flatten()
                    .map(|s| s.to_string()),
                None => None,
            };

            match error_code {
                Some(code) => match code.as_str() {
                    "too_many_result_rows" => Err(SqliteWorkerError::TooManyResultRows)?,
                    "query_execution_error" => Err(SqliteWorkerError::QueryExecutionError(
                        error_message.unwrap_or("Unknown error".to_string()),
                    ))?,
                    _ => Err(SqliteWorkerError::ServerError(
                        uri.to_string(),
                        code,
                        s.into(),
                        error_message,
                    ))?,
                },
                None => Err(SqliteWorkerError::UnexpectedServerError(
                    uri.to_string(),
                    s.into(),
                    format!("No error code in response: {}", body_json.to_string()),
                ))?,
            }
        }
    }
}
