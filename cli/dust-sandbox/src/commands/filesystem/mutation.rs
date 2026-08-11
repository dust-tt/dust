use std::fs;
use std::io;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};

use reqwest::blocking::{Client, Response};
use reqwest::StatusCode;
use serde::Serialize;
use tracing::warn;
use uuid::Uuid;

use super::model::MountIdentity;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const RETRY_TIMEOUT: Duration = Duration::from_secs(35);
const INITIAL_RETRY_DELAY: Duration = Duration::from_millis(100);
const MAX_RETRY_DELAY: Duration = Duration::from_secs(1);

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "operation", rename_all = "snake_case")]
pub enum MutationOperation {
    Mkdir {
        path: String,
    },
    Rmdir {
        path: String,
    },
    Unlink {
        path: String,
    },
    Rename {
        path: String,
        #[serde(rename = "destinationMount")]
        destination_mount: MountIdentity,
        #[serde(rename = "destinationPath")]
        destination_path: String,
    },
    ContentCommitted {
        path: String,
    },
}

pub trait MutationPort: Send + Sync {
    fn apply(
        &self,
        mount: &MountIdentity,
        operation: MutationOperation,
    ) -> Result<(), MutationError>;
}

#[derive(Debug)]
pub struct MutationError {
    pub errno: i32,
    message: String,
}

impl MutationError {
    pub fn new(errno: i32, message: impl Into<String>) -> Self {
        Self {
            errno,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for MutationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for MutationError {}

impl From<io::Error> for MutationError {
    fn from(error: io::Error) -> Self {
        Self::new(error.raw_os_error().unwrap_or(libc::EIO), error.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MutationRequest<'a> {
    idempotency_key: Uuid,
    mount: &'a MountIdentity,
    #[serde(flatten)]
    operation: &'a MutationOperation,
}

pub struct HttpMutationAdapter {
    api_url: String,
    token_file: PathBuf,
    client: Client,
}

impl HttpMutationAdapter {
    pub fn new(api_url: String, token_file: PathBuf) -> anyhow::Result<Self> {
        let client = Client::builder().timeout(REQUEST_TIMEOUT).build()?;
        Ok(Self {
            api_url,
            token_file,
            client,
        })
    }

    fn token(&self) -> io::Result<String> {
        let token = fs::read_to_string(&self.token_file)?.trim().to_owned();
        if token.is_empty() {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "filesystem mutation token is empty",
            ));
        }
        Ok(token)
    }

    fn send(&self, token: &str, request: &MutationRequest<'_>) -> Result<Response, reqwest::Error> {
        self.client
            .post(&self.api_url)
            .bearer_auth(token)
            .json(request)
            .send()
    }
}

impl MutationPort for HttpMutationAdapter {
    fn apply(
        &self,
        mount: &MountIdentity,
        operation: MutationOperation,
    ) -> Result<(), MutationError> {
        let request = MutationRequest {
            idempotency_key: Uuid::new_v4(),
            mount,
            operation: &operation,
        };
        let started_at = Instant::now();
        let mut retry_delay = INITIAL_RETRY_DELAY;

        loop {
            let attempt = self.token().map_err(MutationError::from).and_then(|token| {
                self.send(&token, &request)
                    .map_err(|error| MutationError::new(libc::EIO, error.to_string()))
            });

            let last_error = match attempt {
                Ok(response) if response.status() == StatusCode::OK => return Ok(()),
                Ok(response) if is_permanent_status(response.status()) => {
                    let error = permanent_http_error(response);
                    warn!(
                        mount = ?mount,
                        operation = ?operation,
                        errno = error.errno,
                        error = %error,
                        "filesystem mutation rejected"
                    );
                    return Err(error);
                }
                Ok(response) => format!("mutation HTTP {}", response.status()),
                Err(error) => error.to_string(),
            };

            if started_at.elapsed() >= RETRY_TIMEOUT {
                let error = MutationError::new(
                    libc::EIO,
                    format!("filesystem mutation failed: {last_error}"),
                );
                warn!(
                    mount = ?mount,
                    operation = ?operation,
                    error = %error,
                    "filesystem mutation retries exhausted"
                );
                return Err(error);
            }

            thread::sleep(retry_delay);
            retry_delay = retry_delay.saturating_mul(2).min(MAX_RETRY_DELAY);
        }
    }
}

fn is_permanent_status(status: StatusCode) -> bool {
    matches!(status.as_u16(), 400 | 401 | 403 | 404)
}

fn permanent_http_error(response: Response) -> MutationError {
    let status = response.status();
    let errno = match status.as_u16() {
        400 => libc::EINVAL,
        401 | 403 => libc::EACCES,
        404 => libc::ENOENT,
        _ => libc::EIO,
    };
    let fallback = format!("filesystem mutation HTTP {status}");
    let message = response
        .json::<serde_json::Value>()
        .ok()
        .and_then(|body| {
            body.pointer("/error/message")
                .and_then(serde_json::Value::as_str)
                .map(ToOwned::to_owned)
        })
        .unwrap_or(fallback);
    MutationError::new(errno, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::filesystem::model::MountKind;

    #[test]
    fn rename_request_uses_the_existing_wire_contract() {
        let mount = MountIdentity {
            kind: MountKind::Conversation,
            id: "conv_123".to_owned(),
        };
        let operation = MutationOperation::Rename {
            path: "frame.tsx".to_owned(),
            destination_mount: MountIdentity {
                kind: MountKind::Pod,
                id: "pod_123".to_owned(),
            },
            destination_path: "frames/frame.tsx".to_owned(),
        };
        let request = MutationRequest {
            idempotency_key: Uuid::nil(),
            mount: &mount,
            operation: &operation,
        };

        let value = serde_json::to_value(request).expect("request should serialize");
        assert_eq!(value["idempotencyKey"], Uuid::nil().to_string());
        assert_eq!(value["mount"]["kind"], "conversation");
        assert_eq!(value["operation"], "rename");
        assert_eq!(value["destinationMount"]["kind"], "pod");
        assert_eq!(value["destinationPath"], "frames/frame.tsx");
    }
}
