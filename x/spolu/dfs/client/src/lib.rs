//! Blocking HTTP transport, usable from bounded FUSE worker threads on Linux or natively on macOS.
use std::{
    io::{Read, Write},
    time::Duration,
};

use dfs_protocol::wire::*;
use reqwest::{
    Method, Url,
    blocking::{Body, Client as HttpClient, Response},
    header::{AUTHORIZATION, HeaderMap, HeaderValue},
};
use serde::{Serialize, de::DeserializeOwned};

pub use dfs_protocol as protocol;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum Error {
    #[error("invalid client configuration")]
    Configuration,
    #[error("request failed; a mutation may have committed")]
    Transport,
    #[error("invalid server response")]
    Protocol,
    #[error("invalid input")]
    InvalidInput,
    #[error("name too long")]
    NameTooLong,
    #[error("not a directory")]
    NotDirectory,
    #[error("is a directory")]
    IsDirectory,
    #[error("session is invalid or expired")]
    Unauthenticated,
    #[error("access denied")]
    Forbidden,
    #[error("object not found or inaccessible")]
    NotFound,
    #[error("concurrent modification")]
    Conflict,
    #[error("already exists")]
    AlreadyExists,
    #[error("directory is not empty")]
    NotEmpty,
    #[error("capacity exhausted")]
    Capacity,
    #[error("service unavailable; a mutation may have committed")]
    Unavailable,
    #[error("unsupported operation")]
    Unsupported,
    #[error("server error")]
    Internal,
}

impl Error {
    pub fn ambiguous(self) -> bool {
        matches!(
            self,
            Self::Transport | Self::Unavailable | Self::Internal | Self::Protocol
        )
    }
}

/// @cc [owner:spolu,label:security] client-session-boundary
/// One client MUST retain one fixed session credential. Never put credentials in URLs, debug output,
/// or errors, follow redirects, or silently recreate a session behind a live mount.
#[derive(Clone)]
pub struct Client {
    http: HttpClient,
    endpoint: Url,
}

const JSON_LIMIT: u64 = 8 * 1024 * 1024;

impl Client {
    pub fn new(endpoint: &str, session_key: &str) -> Result<Self> {
        let mut endpoint = Url::parse(endpoint).map_err(|_| Error::Configuration)?;
        if !matches!(endpoint.scheme(), "http" | "https")
            || endpoint.host_str().is_none()
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
            || endpoint.query().is_some()
            || endpoint.fragment().is_some()
            || !matches!(endpoint.path(), "" | "/")
            || !(32..=512).contains(&session_key.len())
            || !session_key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(Error::Configuration);
        }
        endpoint.set_path("/");
        let mut headers = HeaderMap::new();
        let mut authorization = HeaderValue::from_str(&format!("Bearer {session_key}"))
            .map_err(|_| Error::Configuration)?;
        authorization.set_sensitive(true);
        headers.insert(AUTHORIZATION, authorization);
        let http = HttpClient::builder()
            .default_headers(headers)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(16 * 60))
            .pool_max_idle_per_host(16)
            .build()
            .map_err(|_| Error::Configuration)?;
        Ok(Self { http, endpoint })
    }

    fn request(&self, method: Method, path: &str) -> Result<reqwest::blocking::RequestBuilder> {
        // Only fixed paths below reach this function.
        let url = self.endpoint.join(path).map_err(|_| Error::Configuration)?;
        Ok(self.http.request(method, url))
    }

    fn post<T: Serialize, R: DeserializeOwned>(&self, path: &str, body: &T) -> Result<R> {
        decode(check(self.request(Method::POST, path)?.json(body).send())?)
    }

    fn empty<T: Serialize>(&self, path: &str, body: &T) -> Result<()> {
        check(self.request(Method::POST, path)?.json(body).send())?;
        Ok(())
    }

    pub fn session(&self) -> Result<SessionResponse> {
        decode(check(
            self.request(Method::GET, "sessions/current")?.send(),
        )?)
    }

    pub fn stat(&self, id: &str) -> Result<ObjectAttributes> {
        self.post(
            "objects/stat",
            &StatRequest {
                object_id: id.into(),
            },
        )
    }
    pub fn lookup(&self, parent: &str, name: &str) -> Result<ObjectAttributes> {
        self.post(
            "objects/lookup",
            &LookupRequest {
                parent_id: parent.into(),
                name: name.into(),
            },
        )
    }
    pub fn list(&self, id: &str, after: Option<String>, limit: usize) -> Result<ListResponse> {
        self.post(
            "objects/list",
            &ListRequest {
                directory_id: id.into(),
                after,
                limit,
            },
        )
    }
    pub fn mkdir(&self, request: &MkdirRequest) -> Result<ObjectAttributes> {
        self.post("objects/mkdir", request)
    }
    pub fn update(&self, request: &UpdateMetadataRequest) -> Result<ObjectAttributes> {
        self.post("objects/update", request)
    }
    pub fn rename(&self, request: &RenameRequest) -> Result<ObjectAttributes> {
        self.post("objects/rename", request)
    }
    pub fn remove(&self, request: &RemoveRequest, directory: bool) -> Result<()> {
        self.empty(
            if directory {
                "objects/rmdir"
            } else {
                "objects/unlink"
            },
            request,
        )
    }
    pub fn open(&self, request: &OpenFileRequest) -> Result<OpenFileResponse> {
        self.post("files/open", request)
    }
    pub fn truncate(&self, request: &TruncateFileRequest) -> Result<MutationReceipt> {
        self.post("files/truncate", request)
    }
    pub fn fsync(&self, id: &str, sequence: u64) -> Result<()> {
        self.empty(
            "files/fsync",
            &FsyncFileRequest {
                handle_id: id.into(),
                through_sequence: sequence,
            },
        )
    }
    pub fn close(&self, id: &str) -> Result<()> {
        self.empty(
            "files/close",
            &CloseFileRequest {
                handle_id: id.into(),
            },
        )
    }
    pub fn status(&self, request: &MutationStatusRequest) -> Result<Option<MutationReceipt>> {
        self.post("files/status", request)
    }
    pub fn start_upload(&self, request: &StartUploadRequest) -> Result<UploadReceipt> {
        self.post("uploads/start", request)
    }
    pub fn commit_upload(&self, request: &CommitUploadRequest) -> Result<MutationReceipt> {
        self.post("uploads/commit", request)
    }
    pub fn upload_status(&self, id: &str) -> Result<UploadReceipt> {
        self.post(
            "uploads/status",
            &UploadStatusRequest {
                upload_id: id.into(),
            },
        )
    }

    /// @cc [owner:spolu,label:performance] bounded-client-content
    /// Uploads and downloads MUST stream with backpressure. Only control JSON and individual bounded
    /// FUSE requests may be buffered in RAM; never collect a complete file in the client.
    pub fn upload<R: Read + Send + 'static>(
        &self,
        id: &str,
        reader: R,
        length: Option<u64>,
    ) -> Result<UploadReceipt> {
        let body = match length {
            Some(n) => Body::sized(reader, n),
            None => Body::new(reader),
        };
        decode(check(
            self.request(Method::PUT, "uploads/content")?
                .header("Content-Type", "application/octet-stream")
                .header("Dfs-Upload-Id", id)
                .body(body)
                .send(),
        )?)
    }

    pub fn read(&self, request: &ReadFileRequest, mut destination: impl Write) -> Result<u64> {
        let response = check(
            self.request(Method::POST, "files/read")?
                .json(request)
                .send(),
        )?;
        let length = response.content_length().ok_or(Error::Protocol)?;
        if length > request.length {
            return Err(Error::Protocol);
        }
        let version = response
            .headers()
            .get("Dfs-Content-Version")
            .and_then(|v| v.to_str().ok())
            .ok_or(Error::Protocol)?;
        if request
            .content_version
            .as_deref()
            .is_some_and(|expected| expected != version)
        {
            return Err(Error::Protocol);
        }
        let copied = std::io::copy(&mut response.take(length), &mut destination)
            .map_err(|_| Error::Transport)?;
        if copied != length {
            return Err(Error::Transport);
        }
        Ok(copied)
    }

    pub fn write<R: Read + Send + 'static>(
        &self,
        handle: &str,
        request_id: &str,
        sequence: u64,
        offset: u64,
        length: u64,
        reader: R,
    ) -> Result<MutationReceipt> {
        decode(check(
            self.request(Method::PUT, "files/write")?
                .header("Content-Type", "application/octet-stream")
                .header("Dfs-Handle-Id", handle)
                .header("Dfs-Request-Id", request_id)
                .header("Dfs-Write-Sequence", sequence)
                .header("Dfs-Write-Offset", offset)
                .header("Dfs-Write-Length", length)
                .body(Body::sized(reader, length))
                .send(),
        )?)
    }
}

fn decode<T: DeserializeOwned>(response: Response) -> Result<T> {
    let mut bytes = Vec::new();
    response
        .take(JSON_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Error::Transport)?;
    if bytes.len() as u64 > JSON_LIMIT {
        return Err(Error::Protocol);
    }
    serde_json::from_slice(&bytes).map_err(|_| Error::Protocol)
}

fn check(result: reqwest::Result<Response>) -> Result<Response> {
    let response = result.map_err(|_| Error::Transport)?;
    if response.status().is_success() {
        return Ok(response);
    }
    #[derive(serde::Deserialize)]
    struct Envelope {
        error: Code,
    }
    #[derive(serde::Deserialize)]
    struct Code {
        code: String,
    }
    let envelope: Envelope = decode(response)?;
    Err(match envelope.error.code.as_str() {
        "invalid_input" => Error::InvalidInput,
        "name_too_long" => Error::NameTooLong,
        "not_directory" => Error::NotDirectory,
        "is_directory" => Error::IsDirectory,
        "unauthenticated" => Error::Unauthenticated,
        "forbidden" => Error::Forbidden,
        "not_found" => Error::NotFound,
        "conflict" => Error::Conflict,
        "already_exists" => Error::AlreadyExists,
        "not_empty" => Error::NotEmpty,
        "capacity_exhausted" => Error::Capacity,
        "unavailable" => Error::Unavailable,
        "unsupported" | "method_not_allowed" => Error::Unsupported,
        _ => Error::Internal,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_credentials_and_extra_components_in_endpoint() {
        let key = "dfss_test_key_012345678901234567890";
        for endpoint in [
            "http://user@localhost",
            "https://localhost/?token=secret",
            "https://localhost/#secret",
            "file:///tmp/dfs",
            "https://localhost/path",
        ] {
            assert!(matches!(
                Client::new(endpoint, key),
                Err(Error::Configuration)
            ));
        }
        assert!(Client::new("http://127.0.0.1:8080", key).is_ok());
        assert!(matches!(
            Client::new("https://localhost", "secret\r\nheader"),
            Err(Error::Configuration)
        ));
    }
}
