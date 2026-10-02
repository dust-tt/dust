use ::dfs_client::Client;
use ::dfs_server_v2::{
    State,
    api::Api,
    storage::{Storage, StorageConfig, WriteBatch},
};
use anyhow::{Context, Result};
use dfs_protocol::{MAX_MESSAGE, error::code, rpc::*};
use tokio_stream::wrappers::TcpListenerStream;

#[test]
fn grpc_binary_io_authentication_and_conflict_details() -> Result<()> {
    dfs_server_v2::network::run(async {
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let storage = Storage::open(&StorageConfig {
            fdb_cluster_file: std::env::var("DFS_FDB_CLUSTER_FILE")?,
            fdb_prefix: format!("dfs-v2-transport-{suffix}"),
        })
        .await?;
        let server_key = "ab".repeat(32);
        let state = State::new(storage, &server_key)?;
        let es_url = std::env::var("DFS_ES_URL")?;
        let es_index = format!("dfs-v2-transport-{suffix}");
        let search =
            ::dfs_server_v2::search::Search::open(::dfs_server_v2::search::SearchConfig {
                es_url: es_url.clone(),
                es_index: es_index.clone(),
            })?;
        state
            .search
            .set(search.clone())
            .map_err(|_| anyhow::anyhow!("already initialized"))?;
        search.start(&state).await?;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let endpoint = format!("http://{}", listener.local_addr()?);
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let service = dfs_server::DfsServer::new(Api(state.clone()))
            .max_decoding_message_size(MAX_MESSAGE)
            .max_encoding_message_size(MAX_MESSAGE);
        let server = tokio::spawn(
            tonic::transport::Server::builder()
                .add_service(service)
                .serve_with_incoming_shutdown(TcpListenerStream::new(listener), async {
                    let _ = stopped.await;
                }),
        );
        let admin = Client::connect(&endpoint, &server_key).await?;
        let workspace = admin
            .create_workspace(CreateWorkspaceRequest {
                workspace_id: "transport".into(),
                root_grants: vec!["owner".into()],
            })
            .await?;
        let manager = Client::connect(&endpoint, &workspace.workspace_key).await?;
        let session = manager
            .create_session(CreateSessionRequest {
                workspace_id: workspace.workspace_id,
                grants: vec!["owner".into()],
            })
            .await?;
        let client = Client::connect(&endpoint, &session.session_key).await?;
        assert!(
            client
                .current_session(Empty {})
                .await?
                .session_key
                .is_empty()
        );
        let file = client
            .create(CreateRequest {
                parent_id: workspace.root_id,
                expected_parent_version: 1,
                name: "binary".into(),
                mode: 0o600,
                ..Default::default()
            })
            .await?
            .object
            .context("file")?;
        let data: Vec<_> = (0..1_048_576).map(|index| (index % 251) as u8).collect();
        let write = WriteRequest {
            object_id: file.id.clone(),
            expected_version: file.version,
            data: data.clone(),
            ..Default::default()
        };
        let written = client
            .write(write.clone())
            .await?
            .object
            .context("written file")?;
        let conflict = client
            .write(write)
            .await
            .err()
            .context("duplicate write accepted")?;
        assert_eq!(code(&conflict), ErrorCode::VersionConflict);
        let read = client
            .read(ReadRequest {
                object_id: file.id.clone(),
                length: data.len() as u32,
                version: Some(written.version),
                ..Default::default()
            })
            .await?;
        assert_eq!(read.data, data);
        tokio::time::timeout(std::time::Duration::from_secs(30), async {
            loop {
                let indexed = manager
                    .get_index_status(IndexStatusRequest {
                        workspace_id: "transport".into(),
                    })
                    .await?;
                if indexed.pending == 0 && !indexed.backfilling && indexed.last_commit.is_some() {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
            anyhow::Ok(())
        })
        .await??;
        let search = client
            .search_files(SearchFilesRequest {
                filter: Some(SearchFilter {
                    name: Some("binary".into()),
                    ..Default::default()
                }),
                ..Default::default()
            })
            .await?;
        assert_eq!(search.hits.len(), 1);
        assert!(search.hits[0].excerpt.is_empty());
        client.close_session(Empty {}).await?;
        let error = client
            .stat(ObjectRequest { object_id: file.id })
            .await
            .err()
            .context("closed session accepted")?;
        assert_eq!(code(&error), ErrorCode::Unauthenticated);
        let _ = stop.send(());
        server.await??;
        state.drain().await?;
        reqwest::Client::new()
            .delete(format!("{es_url}/{es_index}"))
            .send()
            .await?
            .error_for_status()?;
        state
            .storage
            .transact(|_| async {
                let mut batch = WriteBatch::new();
                batch.clear(Vec::new(), vec![255]);
                Ok((batch, ()))
            })
            .await?;
        Ok(())
    })
}
