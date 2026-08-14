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
        source_parent_id: 10,
        source_name: "old",
        destination_parent_id: 20,
        destination_name: "new",
    });
    assert_eq!(
        value.ok(),
        Some(serde_json::json!({
            "operation": "rename",
            "requestId": "request",
            "sourceParentId": 10,
            "sourceName": "old",
            "destinationParentId": 20,
            "destinationName": "new"
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

    let value = serde_json::to_value(Operation::Remove {
        request_id: "request",
        parent_id: 10,
        name: "old.txt",
        kind: NodeKind::File,
    });
    assert_eq!(
        value.ok(),
        Some(serde_json::json!({
            "operation": "remove",
            "requestId": "request",
            "parentId": 10,
            "name": "old.txt",
            "kind": "file"
        }))
    );

    let value = serde_json::to_value(Operation::PrepareContentUpload {
        node_id: 42,
        expected_blob_id: None,
        expected_size_bytes: 12,
        content_type: "text/plain",
    });
    assert_eq!(
        value.ok(),
        Some(serde_json::json!({
            "operation": "prepareContentUpload",
            "nodeId": 42,
            "expectedBlobId": null,
            "expectedSizeBytes": 12,
            "contentType": "text/plain"
        }))
    );

    let value = serde_json::to_value(Operation::SetExecutableBits {
        node_id: 42,
        executable_bits: 0o111,
    });
    assert_eq!(
        value.ok(),
        Some(serde_json::json!({
            "operation": "setExecutableBits",
            "nodeId": 42,
            "executableBits": 0o111
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
    fs::set_permissions(&token_file, fs::Permissions::from_mode(0o600)).expect("restrict token");
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
