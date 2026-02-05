use std::time::{Duration, Instant};
use std::{collections::HashMap, sync::Arc};

use http::{
    header::{ACCEPT, AUTHORIZATION},
    HeaderMap,
};
use reqwest::Client;
use tokio::sync::Mutex;
use tokio::time::sleep;

use crate::databases::remote_databases::remote_database::QUERY_TIMEOUT;

use super::{
    chunk::download_chunk,
    error::{Error, Result},
    row::{SnowflakeColumnType, SnowflakeRow},
    session::SnowflakeSession,
};

pub const SESSION_EXPIRED: &str = "390112";
pub const QUERY_IN_PROGRESS_ASYNC_CODE: &str = "333334";

pub struct QueryExecutor {
    http: Client,
    qrmk: String,
    chunks: Mutex<Vec<RawQueryResponseChunk>>,
    chunk_headers: HeaderMap,
    column_types: Arc<Vec<SnowflakeColumnType>>,
    column_indices: Arc<HashMap<String, usize>>,
    row_set: Mutex<Option<Vec<Vec<Option<String>>>>>,
}

impl QueryExecutor {
    pub(super) async fn create<Q: Into<QueryRequest>>(
        sess: &SnowflakeSession,
        request: Q,
    ) -> Result<Self> {
        let SnowflakeSession {
            http,
            account,
            session_token,
            timeout,
        } = sess;
        let timeout = timeout.unwrap_or(QUERY_TIMEOUT);

        let request_id = uuid::Uuid::new_v4();
        let url = format!(
            r"https://{account}.snowflakecomputing.com/queries/v1/query-request?requestId={request_id}"
        );

        let mut request: QueryRequest = request.into();

        if request.parameters.is_none() {
            request.parameters = Some(HashMap::new());
        }
        if let Some(ref mut params) = request.parameters {
            params.insert(
                "STATEMENT_TIMEOUT_IN_SECONDS".to_string(),
                timeout.as_secs().to_string(),
            );
        }
        let response = http
            .post(url)
            .header(ACCEPT, "application/snowflake")
            .header(
                AUTHORIZATION,
                format!(r#"Snowflake Token="{}""#, session_token),
            )
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        let body = response.text().await?;
        if !status.is_success() {
            return Err(Error::Communication(body));
        }

        let mut response: SnowflakeResponse =
            serde_json::from_str(&body).map_err(|e| Error::Json(e, body))?;

        if response.code.as_deref() == Some(QUERY_IN_PROGRESS_ASYNC_CODE) {
            match response.data.get_result_url {
                Some(result_url) => {
                    response =
                        poll_for_async_results(http, account, &result_url, session_token, timeout)
                            .await?
                }
                None => {
                    return Err(Error::NoPollingUrlAsyncQuery);
                }
            }
        }

        if let Some(SESSION_EXPIRED) = response.code.as_deref() {
            return Err(Error::SessionExpired);
        }

        if !response.success {
            return Err(Error::Communication(response.message.unwrap_or_default()));
        }

        if let Some(format) = response.data.query_result_format {
            if format != "json" {
                return Err(Error::UnsupportedFormat(format.clone()));
            }
        }

        let http = http.clone();
        let qrmk = response.data.qrmk.unwrap_or_default();
        let chunks = response.data.chunks.unwrap_or_default();
        let chunks = Mutex::new(chunks);
        let row_types = response.data.row_types.ok_or_else(|| {
            Error::UnsupportedFormat("the response doesn't contain 'rowtype'".to_string())
        })?;
        let row_set = response.data.row_set.ok_or_else(|| {
            Error::UnsupportedFormat("the response doesn't contain 'rowset'".to_string())
        })?;
        let row_set = Mutex::new(Some(row_set));

        let column_indices = row_types
            .iter()
            .enumerate()
            .map(|(i, row_type)| (row_type.name.to_ascii_uppercase(), i))
            .collect::<HashMap<_, _>>();
        let column_indices = Arc::new(column_indices);

        let column_types = row_types
            .into_iter()
            .map(|row_type| SnowflakeColumnType {
                snowflake_type: row_type.data_type,
                nullable: row_type.nullable,
                length: row_type.length,
                precision: row_type.precision,
                scale: row_type.scale,
            })
            .collect::<Vec<_>>();
        let column_types = Arc::new(column_types);

        let chunk_headers = response.data.chunk_headers.unwrap_or_default();
        let chunk_headers: HeaderMap = HeaderMap::try_from(&chunk_headers)?;

        Ok(Self {
            http,
            qrmk,
            chunks,
            chunk_headers,
            column_types,
            column_indices,
            row_set,
        })
    }

    /// Check if there are no more rows to fetch
    pub async fn eof(&self) -> bool {
        let row_set = &*self.row_set.lock().await;
        let chunks = &*self.chunks.lock().await;
        row_set.is_none() && chunks.is_empty()
    }

    /// Fetch a single chunk
    pub async fn fetch_next_chunk(&self) -> Result<Option<Vec<SnowflakeRow>>> {
        let row_set = &mut *self.row_set.lock().await;
        if let Some(row_set) = row_set.take() {
            let rows = row_set.into_iter().map(|r| self.convert_row(r)).collect();
            return Ok(Some(rows));
        }

        let http = self.http.clone();
        let chunk_headers = self.chunk_headers.clone();
        let qrmk = self.qrmk.clone();
        let chunks = &mut *self.chunks.lock().await;
        let Some(chunk) = chunks.pop() else {
            // Nothing to fetch
            return Ok(None);
        };

        let rows = download_chunk(http, chunk.url, chunk_headers, qrmk).await?;
        let rows = rows.into_iter().map(|r| self.convert_row(r)).collect();
        Ok(Some(rows))
    }

    /// Fetch all the remaining chunks at once
    pub async fn fetch_all(&self) -> Result<Vec<SnowflakeRow>> {
        let mut rows = Vec::new();
        let row_set = &mut *self.row_set.lock().await;
        let chunks = &mut *self.chunks.lock().await;
        if let Some(row_set) = row_set.take() {
            rows.extend(row_set.into_iter().map(|r| self.convert_row(r)));
        } else if chunks.is_empty() {
            // Nothing to fetch
            return Ok(vec![]);
        }

        let mut handles = Vec::with_capacity(chunks.len());
        while let Some(chunk) = chunks.pop() {
            let http = self.http.clone();
            let chunk_headers = self.chunk_headers.clone();
            let qrmk = self.qrmk.clone();
            handles.push(tokio::spawn(async move {
                download_chunk(http, chunk.url, chunk_headers, qrmk).await
            }));
        }

        for fut in handles {
            let result = fut.await?;
            rows.extend(result?.into_iter().map(|r| self.convert_row(r)));
        }

        Ok(rows)
    }

    fn convert_row(&self, row: Vec<Option<String>>) -> SnowflakeRow {
        SnowflakeRow {
            row,
            column_indices: Arc::clone(&self.column_indices),
            column_types: Arc::clone(&self.column_types),
        }
    }
}

async fn poll_for_async_results(
    http: &Client,
    account: &str,
    result_url: &str,
    session_token: &str,
    timeout: Duration,
) -> Result<SnowflakeResponse> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        sleep(Duration::from_secs(10)).await;
        let url = format!("https://{account}.snowflakecomputing.com{}", result_url);

        let resp = http
            .get(url)
            .header(ACCEPT, "application/snowflake")
            .header(
                AUTHORIZATION,
                format!(r#"Snowflake Token="{}""#, session_token),
            )
            .send()
            .await?;

        let status = resp.status();
        let body = resp.text().await?;
        if !status.is_success() {
            return Err(Error::Communication(body));
        }

        let response: SnowflakeResponse =
            serde_json::from_str(&body).map_err(|e| Error::Json(e, body))?;
        if response.code.as_deref() != Some(QUERY_IN_PROGRESS_ASYNC_CODE) {
            return Ok(response);
        }
    }

    Err(Error::TimedOut)
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest {
    pub sql_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<HashMap<String, String>>,
}

impl From<&str> for QueryRequest {
    fn from(sql_text: &str) -> Self {
        Self {
            sql_text: sql_text.to_string(),
            parameters: None,
        }
    }
}
impl From<&QueryRequest> for QueryRequest {
    fn from(request: &QueryRequest) -> Self {
        request.clone()
    }
}

impl From<String> for QueryRequest {
    fn from(sql_text: String) -> Self {
        Self {
            sql_text,
            parameters: None,
        }
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawQueryResponse {
    #[allow(unused)]
    parameters: Option<Vec<RawQueryResponseParameter>>,
    #[allow(unused)]
    query_id: String,
    #[allow(unused)]
    get_result_url: Option<String>,
    #[allow(unused)]
    returned: Option<i64>,
    #[allow(unused)]
    total: Option<i64>,

    #[serde(rename = "rowset")]
    row_set: Option<Vec<Vec<Option<String>>>>,

    #[serde(rename = "rowtype")]
    row_types: Option<Vec<RawQueryResponseRowType>>,

    chunk_headers: Option<HashMap<String, String>>,

    qrmk: Option<String>,

    chunks: Option<Vec<RawQueryResponseChunk>>,
    query_result_format: Option<String>,
}
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawQueryResponseRowType {
    #[allow(unused)]
    database: String,
    #[allow(unused)]
    name: String,
    #[allow(unused)]
    nullable: bool,
    #[allow(unused)]
    scale: Option<i64>,
    #[allow(unused)]
    byte_length: Option<i64>,
    #[allow(unused)]
    length: Option<i64>,
    #[allow(unused)]
    schema: String,
    #[allow(unused)]
    table: String,
    #[allow(unused)]
    precision: Option<i64>,

    #[allow(unused)]
    #[serde(rename = "type")]
    data_type: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawQueryResponseParameter {
    #[allow(unused)]
    name: String,

    #[allow(unused)]
    value: serde_json::Value,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawQueryResponseChunk {
    url: String,

    #[allow(unused)]
    row_count: i64,

    #[allow(unused)]
    uncompressed_size: i64,

    #[allow(unused)]
    compressed_size: i64,
}

#[derive(serde::Deserialize, Debug)]
struct SnowflakeResponse {
    data: RawQueryResponse,
    message: Option<String>,
    success: bool,
    code: Option<String>,
}
