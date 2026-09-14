use std::io;

use super::{
    errno, invalid_response, FileSystemClient, InitializeResponse, NodeKind, NodeResponse,
    Operation, ReadDirResponse, RemoteNode, RemoveResponse, RenameResponse, RenamedNode,
};

impl FileSystemClient {
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

    // Returns the node Front removed, which is what tells the caller whether the
    // name still pointed at the node it had looked up.
    pub fn remove(
        &self,
        request_id: &str,
        parent_id: u64,
        name: &str,
        kind: NodeKind,
    ) -> io::Result<u64> {
        Ok(self
            .operation::<RemoveResponse>(&Operation::Remove {
                request_id,
                parent_id,
                name,
                kind,
            })?
            .removed_node_id)
    }

    pub fn rename(
        &self,
        request_id: &str,
        source_parent_id: u64,
        source_name: &str,
        destination_parent_id: u64,
        destination_name: &str,
    ) -> io::Result<RenamedNode> {
        let renamed = self.operation::<RenameResponse>(&Operation::Rename {
            request_id,
            source_parent_id,
            source_name,
            destination_parent_id,
            destination_name,
        })?;
        Ok(RenamedNode {
            node: renamed.node.ok_or_else(invalid_response)?,
            replaced_node_id: renamed.replaced_node_id,
        })
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

    // Answers one request with this body, then stops.
    fn front_answering(body: String) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            read_request(&mut stream);
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write response");
        });
        (format!("http://{address}"), server)
    }

    fn client_calling(api_url: &str, directory: &std::path::Path) -> FileSystemClient {
        let token_file = directory.join("token");
        fs::write(&token_file, "token").expect("write token");
        fs::set_permissions(&token_file, fs::Permissions::from_mode(0o600))
            .expect("restrict token");
        FileSystemClient::new(api_url, "w_test", "token".to_owned(), token_file).expect("client")
    }

    fn renamed_node_body(replaced: &str) -> String {
        format!(
            r#"{{"node":{{"id":42,"parentId":10,"name":"new.txt","kind":"file","mode":420,"size":0,"contentType":null,"blobId":null,"createdAtMs":1,"modifiedAtMs":1}},"replacedNodeId":{replaced}}}"#
        )
    }

    #[test]
    fn a_remove_reports_the_node_front_removed() {
        let directory = tempdir().expect("temporary directory");
        let (api_url, server) = front_answering(r#"{"removedNodeId":9}"#.to_owned());
        let client = client_calling(&api_url, directory.path());

        let removed = client
            .remove("request", 10, "old.txt", NodeKind::File)
            .expect("remove the file");

        assert_eq!(removed, 9);
        server.join().expect("server thread");
    }

    #[test]
    fn a_remove_answered_without_the_removed_node_is_rejected() {
        let directory = tempdir().expect("temporary directory");
        let (api_url, server) = front_answering("{}".to_owned());
        let client = client_calling(&api_url, directory.path());

        let error = client
            .remove("request", 10, "old.txt", NodeKind::File)
            .expect_err("reject an answer that names no node");

        assert_eq!(error.raw_os_error(), Some(libc::EIO));
        server.join().expect("server thread");
    }

    #[test]
    fn a_rename_reports_the_node_it_replaced() {
        let directory = tempdir().expect("temporary directory");
        let (api_url, server) = front_answering(renamed_node_body("7"));
        let client = client_calling(&api_url, directory.path());

        let renamed = client
            .rename("request", 10, "old.txt", 10, "new.txt")
            .expect("rename the file");

        assert_eq!(renamed.node.id, 42);
        assert_eq!(renamed.replaced_node_id, Some(7));
        server.join().expect("server thread");
    }

    #[test]
    fn a_rename_answered_without_the_replaced_node_is_rejected() {
        let directory = tempdir().expect("temporary directory");
        // Front sends null when the destination name was free. Leaving the field
        // out means something else, and guessing between the two is what the
        // daemon must not do.
        let (api_url, server) = front_answering(
            r#"{"node":{"id":42,"parentId":10,"name":"new.txt","kind":"file","mode":420,"size":0,"contentType":null,"blobId":null,"createdAtMs":1,"modifiedAtMs":1}}"#
                .to_owned(),
        );
        let client = client_calling(&api_url, directory.path());

        let error = client
            .rename("request", 10, "old.txt", 10, "new.txt")
            .expect_err("reject an answer that omits the replaced node");

        assert_eq!(error.raw_os_error(), Some(libc::EIO));
        server.join().expect("server thread");
    }

    #[test]
    fn a_rename_onto_a_free_name_reports_that_nothing_was_replaced() {
        let directory = tempdir().expect("temporary directory");
        let (api_url, server) = front_answering(renamed_node_body("null"));
        let client = client_calling(&api_url, directory.path());

        let renamed = client
            .rename("request", 10, "old.txt", 10, "new.txt")
            .expect("rename the file");

        assert_eq!(renamed.replaced_node_id, None);
        server.join().expect("server thread");
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
    fn retries_a_completed_operation_when_its_response_body_is_cut_off() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
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
            let mut requests = Vec::new();
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().expect("accept request");
                requests.push(read_request(&mut stream));
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .expect("write response headers");
                if attempt == 0 {
                    stream
                        .write_all(&body.as_bytes()[..body.len() / 2])
                        .expect("write partial response");
                } else {
                    stream
                        .write_all(body.as_bytes())
                        .expect("write complete response");
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
            .expect("retried create response");
        assert_eq!(node.id, 42);

        let requests = server.join().expect("server thread");
        assert_eq!(requests.len(), 2);
        assert!(requests.iter().all(|request| request.contains(request_id)));
    }

    #[test]
    fn rejects_a_directory_page_without_an_end_cursor() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listen");
        let address = listener.local_addr().expect("local address");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            read_request(&mut stream);
            let body = r#"{"nodes":[]}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write response");
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
        let error = client.children(42).expect_err("reject missing cursor");
        assert_eq!(error.raw_os_error(), Some(libc::EIO));
        server.join().expect("server thread");
    }
}
