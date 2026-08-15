use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom, Write};

use reqwest::blocking::Body;
use tracing::warn;

use super::{
    declared_content_length, errno, has_create_only_precondition, invalid_response,
    is_retryable_io_error, is_retryable_status, network_error, sleep_before_retry, ContentDownload,
    ContentResponse, ContentUpload, FileSystemClient, NodeResponse, Operation, RemoteNode,
    UploadResponse, CONTENT_TRANSFER_TIMEOUT, MAX_ERROR_DETAIL_BYTES, MAX_HTTP_ATTEMPTS,
};

impl FileSystemClient {
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use std::net::TcpListener;
    use std::os::unix::fs::PermissionsExt;

    use tempfile::tempdir;

    use super::*;
    use crate::commands::filesystem::client::test_support::read_request;

    #[test]
    fn retries_an_interrupted_content_download_from_the_start() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().expect("accept request");
                read_request(&mut stream);
                stream
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\n")
                    .expect("write response headers");
                stream
                    .write_all(if attempt == 0 { b"con" } else { b"content" })
                    .expect("write response body");
            }
        });

        let directory = tempdir().expect("temporary directory");
        let token_file = directory.path().join("token");
        fs::write(&token_file, "token").expect("write token");
        fs::set_permissions(&token_file, fs::Permissions::from_mode(0o600))
            .expect("restrict token");
        let client = FileSystemClient::new(
            "http://127.0.0.1:1",
            "w_test",
            "token".to_owned(),
            token_file,
        )
        .expect("client");
        let content_path = directory.path().join("content");
        let mut destination = fs::File::create(&content_path).expect("create content file");
        client
            .download(&format!("http://{address}/content"), &mut destination)
            .expect("retried download");
        drop(destination);
        assert_eq!(fs::read(content_path).expect("read content"), b"content");
        server.join().expect("server thread");
    }

    #[test]
    fn upload_sends_every_header_signed_by_front() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let request = read_request(&mut stream);
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .expect("write response");
            request
        });

        let directory = tempdir().expect("temporary directory");
        let token_file = directory.path().join("token");
        fs::write(&token_file, "token").expect("write token");
        fs::set_permissions(&token_file, fs::Permissions::from_mode(0o600))
            .expect("restrict token");
        let client = FileSystemClient::new(
            "http://127.0.0.1:1",
            "w_test",
            "token".to_owned(),
            token_file,
        )
        .expect("client");
        let content_path = directory.path().join("content");
        fs::write(&content_path, "content").expect("write content");
        let upload = ContentUpload {
            blob_id: "blob".to_owned(),
            upload_url: format!("http://{address}/upload"),
            content_type: "text/plain".to_owned(),
            expected_size_bytes: 7,
            headers: [
                ("content-type".to_owned(), "text/plain".to_owned()),
                ("content-length".to_owned(), "7".to_owned()),
                ("content-encoding".to_owned(), "identity".to_owned()),
                ("x-goog-if-generation-match".to_owned(), "0".to_owned()),
            ]
            .into(),
        };
        client
            .upload(
                &upload,
                fs::File::open(content_path).expect("open content"),
                7,
            )
            .expect("upload content");

        let request = server.join().expect("server thread").to_ascii_lowercase();
        assert!(request.contains("content-type: text/plain"));
        assert!(request.contains("content-length: 7"));
        assert!(request.contains("content-encoding: identity"));
        assert!(request.contains("x-goog-if-generation-match: 0"));
        assert!(request.ends_with("content"));
    }

    #[test]
    fn accepts_create_only_412_after_an_ambiguous_upload_attempt() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().expect("accept request");
                read_request(&mut stream);
                if attempt == 1 {
                    stream
                        .write_all(
                            b"HTTP/1.1 412 Precondition Failed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        )
                        .expect("write precondition response");
                }
            }
        });

        let directory = tempdir().expect("temporary directory");
        let token_file = directory.path().join("token");
        fs::write(&token_file, "token").expect("write token");
        fs::set_permissions(&token_file, fs::Permissions::from_mode(0o600))
            .expect("restrict token");
        let client = FileSystemClient::new(
            "http://127.0.0.1:1",
            "w_test",
            "token".to_owned(),
            token_file,
        )
        .expect("client");
        let content_path = directory.path().join("content");
        fs::write(&content_path, "content").expect("write content");
        let upload = ContentUpload {
            blob_id: "blob".to_owned(),
            upload_url: format!("http://{address}/upload"),
            content_type: "text/plain".to_owned(),
            expected_size_bytes: 7,
            headers: [
                ("content-length".to_owned(), "7".to_owned()),
                ("x-goog-if-generation-match".to_owned(), "0".to_owned()),
            ]
            .into(),
        };
        client
            .upload(
                &upload,
                fs::File::open(content_path).expect("open content"),
                7,
            )
            .expect("continue after ambiguous upload");
        server.join().expect("server thread");
    }

    #[test]
    fn rejects_create_only_412_without_an_earlier_upload_attempt() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            read_request(&mut stream);
            stream
                .write_all(
                    b"HTTP/1.1 412 Precondition Failed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .expect("write precondition response");
        });

        let directory = tempdir().expect("temporary directory");
        let token_file = directory.path().join("token");
        fs::write(&token_file, "token").expect("write token");
        fs::set_permissions(&token_file, fs::Permissions::from_mode(0o600))
            .expect("restrict token");
        let client = FileSystemClient::new(
            "http://127.0.0.1:1",
            "w_test",
            "token".to_owned(),
            token_file,
        )
        .expect("client");
        let content_path = directory.path().join("content");
        fs::write(&content_path, "content").expect("write content");
        let upload = ContentUpload {
            blob_id: "blob".to_owned(),
            upload_url: format!("http://{address}/upload"),
            content_type: "text/plain".to_owned(),
            expected_size_bytes: 7,
            headers: [
                ("content-length".to_owned(), "7".to_owned()),
                ("x-goog-if-generation-match".to_owned(), "0".to_owned()),
            ]
            .into(),
        };
        let error = client
            .upload(
                &upload,
                fs::File::open(content_path).expect("open content"),
                7,
            )
            .expect_err("reject unexplained precondition failure");
        assert_eq!(error.raw_os_error(), Some(libc::EIO));
        server.join().expect("server thread");
    }
}
