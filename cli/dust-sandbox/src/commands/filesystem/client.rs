use std::fs::{File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::PathBuf;
use std::sync::Mutex;

use reqwest::blocking::{Body, Client};
use reqwest::header::{CONTENT_LENGTH, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use tracing::warn;

const FILESYSTEM_ERROR_HEADER: &str = "x-dust-filesystem-error";
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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OperationResponse {
    roots: Option<Vec<RemoteNode>>,
    node: Option<RemoteNode>,
    nodes: Option<Vec<RemoteNode>>,
    next_after_name: Option<String>,
    content: Option<ContentDownload>,
    upload: Option<ContentUpload>,
}

#[derive(Serialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
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
    SetAttributes {
        node_id: u64,
        mode: u16,
    },
    GetContent {
        node_id: u64,
    },
    PrepareContentUpload {
        node_id: u64,
        expected_blob_id: Option<&'a str>,
        content_type: &'a str,
    },
    CommitContentUpload {
        node_id: u64,
        expected_blob_id: Option<&'a str>,
        blob_id: &'a str,
        content_type: &'a str,
    },
    Remove {
        request_id: &'a str,
        parent_id: u64,
        name: &'a str,
    },
    Rename {
        request_id: &'a str,
        parent_id: u64,
        name: &'a str,
        new_parent_id: u64,
        new_name: &'a str,
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
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
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

    fn operation(&self, operation: &Operation<'_>) -> io::Result<OperationResponse> {
        let mut token_reloaded = false;
        let mut attempt = 0;
        let response = loop {
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
                Ok(response) => break response,
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
        };
        if !response.status().is_success() {
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
        response.json().map_err(network_error)
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
        self.operation(&Operation::Initialize)?
            .roots
            .ok_or_else(invalid_response)
    }

    pub fn lookup(&self, parent_id: u64, name: &str) -> io::Result<RemoteNode> {
        self.operation(&Operation::Lookup { parent_id, name })?
            .node
            .ok_or_else(|| errno(libc::ENOENT))
    }

    pub fn node(&self, node_id: u64) -> io::Result<RemoteNode> {
        self.operation(&Operation::GetAttr { node_id })?
            .node
            .ok_or_else(|| errno(libc::ENOENT))
    }

    pub fn children(&self, node_id: u64) -> io::Result<Vec<RemoteNode>> {
        let mut nodes = Vec::new();
        let mut after_name: Option<String> = None;
        loop {
            let response = self.operation(&Operation::ReadDir {
                node_id,
                after_name: after_name.as_deref(),
                limit: 256,
            })?;
            nodes.extend(response.nodes.ok_or_else(invalid_response)?);
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
        self.operation(&Operation::Create {
            request_id,
            parent_id,
            name,
            kind,
            mode,
        })?
        .node
        .ok_or_else(invalid_response)
    }

    pub fn set_mode(&self, node_id: u64, mode: u16) -> io::Result<RemoteNode> {
        self.operation(&Operation::SetAttributes { node_id, mode })?
            .node
            .ok_or_else(invalid_response)
    }

    pub fn remove(&self, request_id: &str, parent_id: u64, name: &str) -> io::Result<()> {
        self.operation(&Operation::Remove {
            request_id,
            parent_id,
            name,
        })?;
        Ok(())
    }

    pub fn rename(
        &self,
        request_id: &str,
        parent_id: u64,
        name: &str,
        new_parent_id: u64,
        new_name: &str,
    ) -> io::Result<RemoteNode> {
        self.operation(&Operation::Rename {
            request_id,
            parent_id,
            name,
            new_parent_id,
            new_name,
        })?
        .node
        .ok_or_else(invalid_response)
    }

    pub fn content(&self, node_id: u64) -> io::Result<ContentDownload> {
        self.operation(&Operation::GetContent { node_id })?
            .content
            .ok_or_else(invalid_response)
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
                    io::copy(&mut response, destination)?;
                    return Ok(());
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
        content_type: &str,
    ) -> io::Result<ContentUpload> {
        self.operation(&Operation::PrepareContentUpload {
            node_id,
            expected_blob_id,
            content_type,
        })?
        .upload
        .ok_or_else(invalid_response)
    }

    pub fn upload(&self, upload: &ContentUpload, file: File, size: u64) -> io::Result<()> {
        for attempt in 0..MAX_HTTP_ATTEMPTS {
            let mut attempt_file = file.try_clone()?;
            attempt_file.seek(SeekFrom::Start(0))?;
            let response = self
                .http
                .put(&upload.upload_url)
                .header(CONTENT_TYPE, &upload.content_type)
                .header(CONTENT_LENGTH, size)
                .timeout(CONTENT_TRANSFER_TIMEOUT)
                .body(Body::new(attempt_file))
                .send()
                .map_err(network_error);
            match response {
                Ok(response) if response.status().is_success() => return Ok(()),
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
    ) -> io::Result<RemoteNode> {
        self.operation(&Operation::CommitContentUpload {
            node_id,
            expected_blob_id,
            blob_id: &upload.blob_id,
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
        Some("busy") => errno(libc::EBUSY),
        Some("invalid_operation") => errno(libc::EINVAL),
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
    let (kind, message) = if error.is_timeout() {
        (io::ErrorKind::TimedOut, "filesystem HTTP request timed out")
    } else if error.is_connect() {
        (
            io::ErrorKind::ConnectionRefused,
            "filesystem HTTP connection failed",
        )
    } else if error.is_decode() {
        (
            io::ErrorKind::InvalidData,
            "filesystem HTTP response was invalid",
        )
    } else if error.is_body() {
        (
            io::ErrorKind::UnexpectedEof,
            "filesystem HTTP body transfer failed",
        )
    } else if error.is_request() && !error.is_builder() {
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
mod tests {
    use std::fs;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::os::unix::fs::{symlink, PermissionsExt};

    use tempfile::tempdir;

    use super::{
        filesystem_error, network_error, read_token_file, FileSystemClient, NodeKind, Operation,
    };

    fn read_request(stream: &mut TcpStream) -> String {
        let mut request = Vec::new();
        let mut expected_len = None;
        loop {
            let mut buffer = [0_u8; 4096];
            let read = stream.read(&mut buffer).expect("read request");
            assert!(read > 0, "client closed before request completed");
            request.extend_from_slice(&buffer[..read]);
            if expected_len.is_none() {
                if let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..header_end]);
                    let content_len = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().ok())
                                .flatten()
                        })
                        .unwrap_or(0);
                    expected_len = Some(header_end + 4 + content_len);
                }
            }
            if expected_len.is_some_and(|length| request.len() >= length) {
                return String::from_utf8(request).expect("UTF-8 request");
            }
        }
    }

    #[test]
    fn maps_front_errors_to_posix_errors() {
        assert_eq!(
            filesystem_error(Some("not_empty")).raw_os_error(),
            Some(libc::ENOTEMPTY)
        );
        assert_eq!(
            filesystem_error(Some("stale")).raw_os_error(),
            Some(libc::ESTALE)
        );
        assert_eq!(filesystem_error(None).raw_os_error(), Some(libc::EIO));
    }

    #[test]
    fn serializes_front_field_names() {
        let value = serde_json::to_value(Operation::Rename {
            request_id: "request",
            parent_id: 10,
            name: "old",
            new_parent_id: 20,
            new_name: "new",
        });
        assert_eq!(
            value.ok(),
            Some(serde_json::json!({
                "operation": "rename",
                "requestId": "request",
                "parentId": 10,
                "name": "old",
                "newParentId": 20,
                "newName": "new"
            }))
        );

        let value = serde_json::to_value(Operation::Create {
            request_id: "5f19e8a3-b8b2-4eb3-aa55-8944735922f1",
            parent_id: 10,
            name: "new.txt",
            kind: NodeKind::File,
            mode: 0o644,
        });
        assert_eq!(
            value.ok(),
            Some(serde_json::json!({
                "operation": "create",
                "requestId": "5f19e8a3-b8b2-4eb3-aa55-8944735922f1",
                "parentId": 10,
                "name": "new.txt",
                "kind": "file",
                "mode": 0o644
            }))
        );
    }

    #[test]
    fn retries_create_with_the_same_request_id() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            let mut requests = Vec::new();
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().expect("accept request");
                requests.push(read_request(&mut stream));
                if attempt == 0 {
                    stream
                        .write_all(
                            b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        )
                        .expect("write retry response");
                } else {
                    let body = serde_json::json!({
                        "node": {
                            "id": 42,
                            "parentId": 10,
                            "name": "new.txt",
                            "kind": "file",
                            "mode": 0o644,
                            "size": 0,
                            "contentType": null,
                            "blobId": null,
                            "createdAtMs": 1,
                            "modifiedAtMs": 1
                        }
                    })
                    .to_string();
                    write!(
                        stream,
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .expect("write success response");
                }
            }
            requests
        });

        let directory = tempdir().expect("temporary directory");
        let token_file = directory.path().join("token");
        fs::write(&token_file, "token").expect("write token");
        fs::set_permissions(&token_file, fs::Permissions::from_mode(0o600))
            .expect("restrict token");
        let client = FileSystemClient::new(
            &format!("http://{address}"),
            "w_test",
            "token".to_owned(),
            token_file,
        )
        .expect("client");
        let request_id = "5f19e8a3-b8b2-4eb3-aa55-8944735922f1";
        let node = client
            .create(request_id, 10, "new.txt", NodeKind::File, 0o644)
            .expect("retried create");
        assert_eq!(node.id, 42);

        let requests = server.join().expect("server thread");
        assert_eq!(requests.len(), 2);
        for request in requests {
            assert!(request.contains(request_id));
        }
    }

    #[test]
    fn token_reload_never_follows_a_symbolic_link() {
        let directory = tempdir().expect("temporary directory");
        let target = directory.path().join("target");
        let link = directory.path().join("token");
        fs::write(&target, "secret").expect("write target");
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).expect("restrict target");
        symlink(&target, &link).expect("create link");

        let error = read_token_file(&link).expect_err("reject link");
        assert_eq!(error.raw_os_error(), Some(libc::ELOOP));
    }

    #[test]
    fn network_errors_do_not_expose_request_urls() {
        let request_error = reqwest::blocking::Client::new()
            .get("http://[invalid/signed-secret")
            .send()
            .expect_err("invalid URL");
        let error = network_error(request_error);
        assert!(!error.to_string().contains("signed-secret"));
    }
}
