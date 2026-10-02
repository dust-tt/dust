//! Operator-only shared-cluster checks through the unchanged v1 client; no secrets in output.
use ::dfs_client::BlockingClient;
use anyhow::{Context, Result, ensure};
use clap::Parser;
use dfs_protocol::{credentials::read_key, rpc::*};
use serde_json::json;
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

#[derive(Parser)]
struct Config {
    #[arg(long)]
    endpoint: String,
    #[arg(long)]
    key_file: PathBuf,
}

fn main() -> Result<()> {
    let config = Config::parse();
    let admin = BlockingClient::connect(&config.endpoint, &read_key(&config.key_file)?)?;
    let mut workspaces = Vec::new();
    let mut sessions = Vec::new();
    let mut targets = Vec::new();
    for i in 0..2 {
        let workspace = admin.create_workspace(CreateWorkspaceRequest {
            workspace_id: format!("active-{i}"),
            root_grants: vec!["owner".into()],
        })?;
        let manager = BlockingClient::connect(&config.endpoint, &workspace.workspace_key)?;
        let session = manager.create_session(CreateSessionRequest {
            workspace_id: workspace.workspace_id.clone(),
            grants: vec!["owner".into()],
        })?;
        let client = BlockingClient::connect(&config.endpoint, &session.session_key)?;
        let directory = client
            .create(CreateRequest {
                parent_id: workspace.root_id.clone(),
                expected_parent_version: 1,
                name: "work".into(),
                directory: true,
                mode: 0o755,
                ..Default::default()
            })?
            .object
            .context("directory")?;
        let mut directory = manager.update_grants(UpdateGrantsRequest {
            workspace_id: workspace.workspace_id.clone(),
            object_id: directory.id,
            expected_version: directory.version,
            changes: vec![GrantChange {
                grant: "owner".into(),
                attached: true,
            }],
        })?;
        for j in 0..32 {
            let mutation = client.create(CreateRequest {
                parent_id: directory.id.clone(),
                expected_parent_version: directory.version,
                name: format!("workspace-{i}-{j}"),
                mode: 0o600,
                ..Default::default()
            })?;
            directory = mutation.related.into_iter().next().context("parent")?;
            let file = mutation.object.context("file")?;
            let file = client
                .write(WriteRequest {
                    object_id: file.id,
                    expected_version: file.version,
                    data: b"needle".to_vec(),
                    ..Default::default()
                })?
                .object
                .context("written")?;
            let file = manager.update_grants(UpdateGrantsRequest {
                workspace_id: workspace.workspace_id.clone(),
                object_id: file.id,
                expected_version: file.version,
                changes: vec![
                    GrantChange {
                        grant: "owner".into(),
                        attached: true,
                    },
                    GrantChange {
                        grant: "reader".into(),
                        attached: true,
                    },
                ],
            })?;
            if j == 0 {
                targets.push(file);
            }
        }
        workspaces.push(workspace);
        sessions.push(session);
    }
    for i in 0..16 {
        admin.create_workspace(CreateWorkspaceRequest {
            workspace_id: format!("idle-{i}"),
            root_grants: vec![],
        })?;
    }
    let mut listing = Vec::new();
    for count in [1, 2, 512] {
        let workspace = &workspaces[0];
        let manager = BlockingClient::connect(&config.endpoint, &workspace.workspace_key)?;
        let mut grants = vec!["owner".into()];
        if count > 1 {
            grants.push("reader".into());
        }
        for i in grants.len()..count {
            grants.push(format!("unattached-{i}"));
        }
        let session = manager.create_session(CreateSessionRequest {
            workspace_id: workspace.workspace_id.clone(),
            grants,
        })?;
        let client = BlockingClient::connect(&config.endpoint, &session.session_key)?;
        let started = Instant::now();
        let mut after = None;
        let mut ids = std::collections::BTreeSet::new();
        loop {
            let page = client.list(ListRequest {
                directory_id: "shared".into(),
                after,
                limit: 7,
            })?;
            for entry in page.entries {
                ensure!(
                    ids.insert(entry.object.context("entry")?.id),
                    "duplicate shared object"
                );
            }
            after = page.next_after;
            if after.is_none() {
                break;
            }
        }
        ensure!(
            ids.len() == 33,
            "shared must retain the folder and all directly granted children"
        );
        listing.push(json!({"grants": count, "entries": ids.len(), "milliseconds": started.elapsed().as_secs_f64() * 1000.}));
    }
    for workspace in &workspaces {
        let client = BlockingClient::connect(&config.endpoint, &workspace.workspace_key)?;
        let started = Instant::now();
        loop {
            let value = client.get_index_status(IndexStatusRequest {
                workspace_id: workspace.workspace_id.clone(),
            })?;
            if value.pending == 0 && !value.backfilling {
                break;
            }
            ensure!(
                started.elapsed() < Duration::from_secs(60),
                "index did not drain"
            );
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    let mut search = Vec::new();
    for (i, session) in sessions.iter().enumerate() {
        let client = BlockingClient::connect(&config.endpoint, &session.session_key)?;
        let started = Instant::now();
        let result = client.search_files(SearchFilesRequest {
            query: "needle".into(),
            limit: 100,
            ..Default::default()
        })?;
        ensure!(
            !result.partial && result.hits.len() == 32,
            "missing workspace results"
        );
        ensure!(
            result
                .hits
                .iter()
                .all(|h| h.name.starts_with(&format!("workspace-{i}-"))),
            "cross-workspace result"
        );
        search.push(json!({"workspace": i, "hits": result.hits.len(), "milliseconds": started.elapsed().as_secs_f64() * 1000.}));
    }
    let started = Instant::now();
    let times = std::thread::scope(|scope| -> Result<Vec<f64>> {
        let jobs: Vec<_> = sessions
            .iter()
            .zip(targets)
            .map(|(session, mut file)| {
                let endpoint = &config.endpoint;
                scope.spawn(move || -> Result<f64> {
                    let client = BlockingClient::connect(endpoint, &session.session_key)?;
                    let started = Instant::now();
                    for _ in 0..50 {
                        file = client
                            .write(WriteRequest {
                                object_id: file.id,
                                expected_version: file.version,
                                data: vec![7; 1024],
                                ..Default::default()
                            })?
                            .object
                            .context("written")?;
                    }
                    let seconds = started.elapsed().as_secs_f64();
                    let bytes = client
                        .read(ReadRequest {
                            object_id: file.id,
                            version: Some(file.version),
                            length: 1024,
                            ..Default::default()
                        })?
                        .data;
                    ensure!(bytes == vec![7; 1024], "write verification failed");
                    Ok(seconds)
                })
            })
            .collect();
        jobs.into_iter()
            .map(|job| job.join().map_err(|_| anyhow::anyhow!("writer panicked"))?)
            .collect()
    })?;
    println!(
        "{}",
        json!({"active_workspaces": 2, "idle_workspaces": 16, "shared": listing, "search": search,
        "concurrent_writes": 100, "writer_seconds": times, "concurrent_wall_seconds": started.elapsed().as_secs_f64()})
    );
    Ok(())
}
