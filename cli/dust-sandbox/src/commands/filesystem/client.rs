use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::PathBuf;
use std::sync::Mutex;

use reqwest::blocking::{Body, Client};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use tracing::warn;

const FILESYSTEM_ERROR_HEADER: &str = "x-dust-filesystem-error";
const GCS_CREATE_ONLY_HEADER: &str = "x-goog-if-generation-match";
const GCS_CREATE_ONLY_VALUE: &str = "0";
const MAX_HTTP_ATTEMPTS: usize = 3;
const HTTP_BACKOFF_MS: [u64; MAX_HTTP_ATTEMPTS - 1] = [50, 200];
const CONTENT_TRANSFER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10 * 60);
const MAX_ERROR_DETAIL_BYTES: u64 = 1024;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    File,
    Directory,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteNode {
    pub id: u64,
    pub parent_id: Option<u64>,
    pub name: String,
    pub kind: NodeKind,
    pub mode: u16,
    pub size: u64,
    pub content_type: Option<String>,
    pub blob_id: Option<String>,
    pub created_at_ms: i64,
    pub modified_at_ms: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentDownload {
    pub blob_id: Option<String>,
    pub download_url: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentUpload {
    pub blob_id: String,
    pub upload_url: String,
    pub content_type: String,
    pub expected_size_bytes: u64,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializeResponse {
    roots: Vec<RemoteNode>,
}

#[derive(Debug, Deserialize)]
struct NodeResponse {
    #[serde(deserialize_with = "deserialize_required_option")]
    node: Option<RemoteNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadDirResponse {
    nodes: Vec<RemoteNode>,
    // Front must send null to mark the last page. A missing field is an
    // invalid response, not an empty cursor.
    #[serde(deserialize_with = "deserialize_required_option")]
    next_after_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ContentResponse {
    content: ContentDownload,
}

#[derive(Debug, Deserialize)]
struct UploadResponse {
    upload: ContentUpload,
}

#[derive(Debug, Deserialize)]
struct EmptyResponse {}

fn deserialize_required_option<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}

#[derive(Serialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
// Operations are serialized immediately, so they borrow their string arguments
// instead of allocating new Strings for every filesystem request.
enum Operation<'a> {
    Initialize,
    Lookup {
        parent_id: u64,
        name: &'a str,
    },
    GetAttr {
        node_id: u64,
    },
    ReadDir {
        node_id: u64,
        after_name: Option<&'a str>,
        limit: u16,
    },
    Create {
        request_id: &'a str,
        parent_id: u64,
        name: &'a str,
        kind: NodeKind,
        mode: u16,
    },
    SetExecutableBits {
        node_id: u64,
        executable_bits: u16,
    },
    GetContent {
        node_id: u64,
    },
    PrepareContentUpload {
        node_id: u64,
        expected_blob_id: Option<&'a str>,
        expected_size_bytes: u64,
        content_type: &'a str,
    },
    CommitContentUpload {
        node_id: u64,
        expected_blob_id: Option<&'a str>,
        blob_id: &'a str,
        expected_size_bytes: u64,
        content_type: &'a str,
    },
    Remove {
        request_id: &'a str,
        parent_id: u64,
        name: &'a str,
        kind: NodeKind,
    },
    Rename {
        request_id: &'a str,
        source_parent_id: u64,
        source_name: &'a str,
        destination_parent_id: u64,
        destination_name: &'a str,
    },
}

pub struct FileSystemClient {
    http: Client,
    endpoint: String,
    token: Mutex<String>,
    token_file: PathBuf,
}

impl FileSystemClient {
    pub fn new(
        api_url: &str,
        workspace_id: &str,
        token: String,
        token_file: PathBuf,
    ) -> io::Result<Self> {
        let http = Client::builder()
            .connect_timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(io::Error::other)?;
        Ok(Self {
            http,
            endpoint: format!(
                "{}/api/v1/w/{}/sandbox/filesystem",
                api_url.trim_end_matches('/'),
                workspace_id
            ),
            token: Mutex::new(token),
            token_file,
        })
    }

    fn operation<T: DeserializeOwned>(&self, operation: &Operation<'_>) -> io::Result<T> {
        let mut token_reloaded = false;
        let mut attempt = 0;
        loop {
            match self.send_operation(operation) {
                Ok(response)
                    if response.status() == reqwest::StatusCode::UNAUTHORIZED
                        && !token_reloaded =>
                {
                    // Front rotates this root-owned file during the normal
                    // sandbox refresh. Reload once without remounting.
                    self.reload_token()?;
                    token_reloaded = true;
                }
                Ok(response)
                    if is_retryable_status(response.status())
                        && attempt + 1 < MAX_HTTP_ATTEMPTS =>
                {
                    warn!(
                        attempt = attempt + 1,
                        status = %response.status(),
                        "retrying filesystem metadata request"
                    );
                    sleep_before_retry(attempt);
                    attempt += 1;
                }
                Ok(response) if !response.status().is_success() => {
                    let status = response.status();
                    let code = response
                        .headers()
                        .get(FILESYSTEM_ERROR_HEADER)
                        .and_then(|value| value.to_str().ok())
                        .map(str::to_owned);
                    warn!(
                        %status,
                        filesystem_error = code.as_deref(),
                        "filesystem metadata request failed"
                    );
                    return Err(filesystem_error(code.as_deref()));
                }
                Ok(response) => {
                    // An early connection close can yield a short body without
                    // a read error, so check its declared length before parsing.
                    let expected_length = declared_content_length(&response);
                    match response.bytes() {
                        Ok(body)
                            if expected_length
                                .is_some_and(|length| length != body.len() as u64)
                                && attempt + 1 < MAX_HTTP_ATTEMPTS =>
                        {
                            warn!(
                                attempt = attempt + 1,
                                "retrying incomplete filesystem metadata response"
                            );
                            sleep_before_retry(attempt);
                            attempt += 1;
                        }
                        Ok(body)
                            if expected_length
                                .is_some_and(|length| length != body.len() as u64) =>
                        {
                            return Err(io::Error::new(
                                io::ErrorKind::UnexpectedEof,
                                "filesystem metadata response was incomplete",
                            ));
                        }
                        Ok(body) => {
                            return serde_json::from_slice(&body).map_err(|error| {
                                warn!(%error, "filesystem metadata response was invalid");
                                invalid_response()
                            });
                        }
                        Err(error) if attempt + 1 < MAX_HTTP_ATTEMPTS => {
                            warn!(
                                attempt = attempt + 1,
                                body = error.is_body(),
                                decode = error.is_decode(),
                                "retrying interrupted filesystem metadata response"
                            );
                            sleep_before_retry(attempt);
                            attempt += 1;
                        }
                        Err(error) => return Err(network_error(error)),
                    }
                }
                Err(error) if is_retryable_io_error(&error) && attempt + 1 < MAX_HTTP_ATTEMPTS => {
                    warn!(
                        attempt = attempt + 1,
                        error_kind = ?error.kind(),
                        "retrying filesystem metadata transport"
                    );
                    sleep_before_retry(attempt);
                    attempt += 1;
                }
                Err(error) => return Err(error),
            }
        }
    }

    fn send_operation(&self, operation: &Operation<'_>) -> io::Result<reqwest::blocking::Response> {
        let token = self.token.lock().map_err(|_| errno(libc::EIO))?.clone();
        self.http
            .post(&self.endpoint)
            .bearer_auth(token)
            .json(operation)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .map_err(network_error)
    }

    fn reload_token(&self) -> io::Result<()> {
        let token = read_token_file(&self.token_file)?;
        if token.is_empty() {
            return Err(errno(libc::EACCES));
        }
        let mut current = self.token.lock().map_err(|_| errno(libc::EIO))?;
        *current = token;
        Ok(())
    }

    pub fn initialize(&self) -> io::Result<Vec<RemoteNode>> {
        Ok(self
            .operation::<InitializeResponse>(&Operation::Initialize)?
            .roots)
    }

    pub fn lookup(&self, parent_id: u64, name: &str) -> io::Result<RemoteNode> {
        self.operation::<NodeResponse>(&Operation::Lookup { parent_id, name })?
            .node
            .ok_or_else(|| errno(libc::ENOENT))
    }

    pub fn node(&self, node_id: u64) -> io::Result<RemoteNode> {
        self.operation::<NodeResponse>(&Operation::GetAttr { node_id })?
            .node
            .ok_or_else(|| errno(libc::ENOENT))
    }

    pub fn children(&self, node_id: u64) -> io::Result<Vec<RemoteNode>> {
        let mut nodes = Vec::new();
        let mut after_name: Option<String> = None;
        loop {
            let response = self.operation::<ReadDirResponse>(&Operation::ReadDir {
                node_id,
                after_name: after_name.as_deref(),
                limit: 256,
            })?;
            nodes.extend(response.nodes);
            match response.next_after_name {
                Some(next) => after_name = Some(next),
                None => return Ok(nodes),
            }
        }
    }

    pub fn create(
        &self,
        request_id: &str,
        parent_id: u64,
        name: &str,
        kind: NodeKind,
        mode: u16,
    ) -> io::Result<RemoteNode> {
        self.operation::<NodeResponse>(&Operation::Create {
            request_id,
            parent_id,
            name,
            kind,
            mode,
        })?
        .node
        .ok_or_else(invalid_response)
    }

    pub fn set_executable_bits(
        &self,
        node_id: u64,
        executable_bits: u16,
    ) -> io::Result<RemoteNode> {
        self.operation::<NodeResponse>(&Operation::SetExecutableBits {
            node_id,
            executable_bits,
        })?
        .node
        .ok_or_else(invalid_response)
    }

    pub fn remove(
        &self,
        request_id: &str,
        parent_id: u64,
        name: &str,
        kind: NodeKind,
    ) -> io::Result<()> {
        self.operation::<EmptyResponse>(&Operation::Remove {
            request_id,
            parent_id,
            name,
            kind,
        })?;
        Ok(())
    }

    pub fn rename(
        &self,
        request_id: &str,
        source_parent_id: u64,
        source_name: &str,
        destination_parent_id: u64,
        destination_name: &str,
    ) -> io::Result<RemoteNode> {
        self.operation::<NodeResponse>(&Operation::Rename {
            request_id,
            source_parent_id,
            source_name,
            destination_parent_id,
            destination_name,
        })?
        .node
        .ok_or_else(invalid_response)
    }

    pub fn content(&self, node_id: u64) -> io::Result<ContentDownload> {
        Ok(self
            .operation::<ContentResponse>(&Operation::GetContent { node_id })?
            .content)
    }

    pub fn download(&self, url: &str, destination: &mut File) -> io::Result<()> {
        for attempt in 0..MAX_HTTP_ATTEMPTS {
            destination.set_len(0)?;
            destination.seek(SeekFrom::Start(0))?;
            match self
                .http
                .get(url)
                .timeout(CONTENT_TRANSFER_TIMEOUT)
                .send()
                .map_err(network_error)
            {
                Ok(mut response) if response.status().is_success() => {
                    let expected_length = declared_content_length(&response);
                    let mut received = 0_u64;
                    let mut buffer = [0_u8; 64 * 1024];
                    // Read and write separately: retry remote read failures,
                    // but return local staging-file errors immediately.
                    loop {
                        match response.read(&mut buffer) {
                            Ok(0)
                                if expected_length.is_some_and(|length| length != received)
                                    && attempt + 1 < MAX_HTTP_ATTEMPTS =>
                            {
                                warn!(
                                    attempt = attempt + 1,
                                    expected_length,
                                    received,
                                    "retrying incomplete filesystem content download"
                                );
                                sleep_before_retry(attempt);
                                break;
                            }
                            Ok(0) if expected_length.is_some_and(|length| length != received) => {
                                return Err(io::Error::new(
                                    io::ErrorKind::UnexpectedEof,
                                    "filesystem content download was incomplete",
                                ));
                            }
                            Ok(0) => return Ok(()),
                            Ok(read) => {
                                destination.write_all(&buffer[..read])?;
                                received += read as u64;
                            }
                            Err(error) if attempt + 1 < MAX_HTTP_ATTEMPTS => {
                                warn!(
                                    attempt = attempt + 1,
                                    error_kind = ?error.kind(),
                                    "retrying interrupted filesystem content download"
                                );
                                sleep_before_retry(attempt);
                                break;
                            }
                            Err(error) => return Err(error),
                        }
                    }
                }
                Ok(response)
                    if is_retryable_status(response.status())
                        && attempt + 1 < MAX_HTTP_ATTEMPTS =>
                {
                    warn!(
                        attempt = attempt + 1,
                        status = %response.status(),
                        "retrying filesystem content download"
                    );
                    sleep_before_retry(attempt);
                }
                Ok(_) => return Err(errno(libc::EIO)),
                Err(error) if is_retryable_io_error(&error) && attempt + 1 < MAX_HTTP_ATTEMPTS => {
                    warn!(
                        attempt = attempt + 1,
                        error_kind = ?error.kind(),
                        "retrying filesystem content download transport"
                    );
                    sleep_before_retry(attempt);
                }
                Err(error) => return Err(error),
            }
        }
        Err(errno(libc::EIO))
    }

    pub fn prepare_upload(
        &self,
        node_id: u64,
        expected_blob_id: Option<&str>,
        expected_size_bytes: u64,
        content_type: &str,
    ) -> io::Result<ContentUpload> {
        Ok(self
            .operation::<UploadResponse>(&Operation::PrepareContentUpload {
                node_id,
                expected_blob_id,
                expected_size_bytes,
                content_type,
            })?
            .upload)
    }

    pub fn upload(&self, upload: &ContentUpload, file: File, size: u64) -> io::Result<()> {
        if upload.expected_size_bytes != size {
            return Err(invalid_response());
        }
        for attempt in 0..MAX_HTTP_ATTEMPTS {
            let mut attempt_file = file.try_clone()?;
            attempt_file.seek(SeekFrom::Start(0))?;
            let mut request = self
                .http
                .put(&upload.upload_url)
                .timeout(CONTENT_TRANSFER_TIMEOUT)
                .body(Body::new(attempt_file));
            // Front signs these headers with the upload URL. GCS rejects the
            // PUT if even one signed header is missing or has another value.
            for (name, value) in &upload.headers {
                request = request.header(name, value);
            }
            let response = request.send().map_err(network_error);
            match response {
                Ok(response) if response.status().is_success() => return Ok(()),
                Ok(response)
                    if response.status() == reqwest::StatusCode::PRECONDITION_FAILED
                        && attempt > 0
                        && has_create_only_precondition(upload) =>
                {
                    // Front gives every upload a new blob ID and verifies the
                    // object before committing it. A lost successful PUT can
                    // therefore continue here when its retry finds the object.
                    return Ok(());
                }
                Ok(response)
                    if is_retryable_status(response.status())
                        && attempt + 1 < MAX_HTTP_ATTEMPTS =>
                {
                    warn!(
                        attempt = attempt + 1,
                        status = %response.status(),
                        "retrying filesystem content upload"
                    );
                    sleep_before_retry(attempt);
                }
                Ok(response) => {
                    let status = response.status();
                    let mut detail = Vec::with_capacity(MAX_ERROR_DETAIL_BYTES as usize);
                    // Error bodies are diagnostic only. Bound the read itself,
                    // rather than truncating after buffering a potentially huge body.
                    let _ = response
                        .take(MAX_ERROR_DETAIL_BYTES)
                        .read_to_end(&mut detail);
                    let detail = String::from_utf8_lossy(&detail);
                    warn!(%status, %detail, "filesystem content upload failed");
                    return Err(errno(libc::EIO));
                }
                Err(error) if is_retryable_io_error(&error) && attempt + 1 < MAX_HTTP_ATTEMPTS => {
                    warn!(
                        attempt = attempt + 1,
                        error_kind = ?error.kind(),
                        "retrying filesystem content upload transport"
                    );
                    sleep_before_retry(attempt);
                }
                Err(error) => return Err(error),
            }
        }
        Err(errno(libc::EIO))
    }

    pub fn commit_upload(
        &self,
        node_id: u64,
        expected_blob_id: Option<&str>,
        upload: &ContentUpload,
        expected_size_bytes: u64,
    ) -> io::Result<RemoteNode> {
        self.operation::<NodeResponse>(&Operation::CommitContentUpload {
            node_id,
            expected_blob_id,
            blob_id: &upload.blob_id,
            expected_size_bytes,
            content_type: &upload.content_type,
        })?
        .node
        .ok_or_else(invalid_response)
    }
}

fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::REQUEST_TIMEOUT
        || status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
}

fn declared_content_length(response: &reqwest::blocking::Response) -> Option<u64> {
    response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
}

fn has_create_only_precondition(upload: &ContentUpload) -> bool {
    upload.headers.iter().any(|(name, value)| {
        name.eq_ignore_ascii_case(GCS_CREATE_ONLY_HEADER) && value == GCS_CREATE_ONLY_VALUE
    })
}

fn is_retryable_io_error(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::TimedOut
            | io::ErrorKind::ConnectionRefused
            | io::ErrorKind::ConnectionReset
            | io::ErrorKind::ConnectionAborted
            | io::ErrorKind::BrokenPipe
            | io::ErrorKind::Interrupted
            | io::ErrorKind::UnexpectedEof
    )
}

fn sleep_before_retry(attempt: usize) {
    let delay_ms = HTTP_BACKOFF_MS
        .get(attempt)
        .copied()
        .unwrap_or(*HTTP_BACKOFF_MS.last().unwrap_or(&200));
    std::thread::sleep(std::time::Duration::from_millis(delay_ms));
}

fn read_token_file(path: &std::path::Path) -> io::Result<String> {
    let mut file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)?;
    if file.metadata()?.permissions().mode() & 0o077 != 0 {
        return Err(errno(libc::EACCES));
    }
    let mut token = String::new();
    file.read_to_string(&mut token)?;
    let token = token.trim().to_owned();
    if token.is_empty() {
        return Err(errno(libc::EACCES));
    }
    Ok(token)
}

fn filesystem_error(code: Option<&str>) -> io::Error {
    match code {
        Some("already_exists") => errno(libc::EEXIST),
        Some("invalid_operation") => errno(libc::EINVAL),
        Some("is_directory") => errno(libc::EISDIR),
        Some("not_directory") => errno(libc::ENOTDIR),
        Some("not_empty") => errno(libc::ENOTEMPTY),
        Some("not_found") => errno(libc::ENOENT),
        Some("stale") => errno(libc::ESTALE),
        Some("unauthorized") => errno(libc::EACCES),
        _ => errno(libc::EIO),
    }
}

fn network_error(error: reqwest::Error) -> io::Error {
    // reqwest's Display includes the full URL. Filesystem content URLs are
    // signed credentials, so return only a stable category to callers/logs.
    // Its error checks can overlap, so keep the most specific ones first.
    let (kind, message) = if error.is_timeout() {
        (io::ErrorKind::TimedOut, "filesystem HTTP request timed out")
    } else if error.is_connect() {
        (
            io::ErrorKind::ConnectionRefused,
            "filesystem HTTP connection failed",
        )
    } else if error.is_body() {
        (
            io::ErrorKind::UnexpectedEof,
            "filesystem HTTP body transfer failed",
        )
    } else if error.is_request() {
        (
            io::ErrorKind::ConnectionAborted,
            "filesystem HTTP request was interrupted",
        )
    } else {
        (io::ErrorKind::Other, "filesystem HTTP request failed")
    };
    warn!(
        timeout = error.is_timeout(),
        connect = error.is_connect(),
        decode = error.is_decode(),
        body = error.is_body(),
        request = error.is_request(),
        status = error.status().map(|status| status.as_u16()),
        "filesystem HTTP transport error"
    );
    io::Error::new(kind, message)
}

fn invalid_response() -> io::Error {
    errno(libc::EIO)
}

fn errno(code: i32) -> io::Error {
    io::Error::from_raw_os_error(code)
}

#[cfg(test)]
mod tests;
