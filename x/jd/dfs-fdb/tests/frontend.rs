use dfs_fdb::{
    client::Client,
    engine::token_hash,
    model::*,
    rpc::{decode, encode},
    wire::dfs_client::DfsClient,
};
use std::{
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::Duration,
};
use tonic::transport::Endpoint;

struct Frontend {
    child: Child,
    endpoint: String,
    log: PathBuf,
}

impl Drop for Frontend {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Frontend {
    fn router(directory: &Path, frontends: &[String]) -> anyhow::Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let address = listener.local_addr()?;
        drop(listener);
        let log = directory.join("router.log");
        let stdout = std::fs::File::create(&log)?;
        let stderr = stdout.try_clone()?;
        let child = Command::new(env!("CARGO_BIN_EXE_dfs-router"))
            .args([
                "--frontends",
                &frontends.join(","),
                "--listen",
                &address.to_string(),
                "--credentials",
            ])
            .arg(directory.join("credentials.json"))
            .env("RUST_LOG", "dfs_fdb=info")
            .stdin(Stdio::null())
            .stdout(stdout)
            .stderr(stderr)
            .spawn()?;
        Ok(Self {
            child,
            endpoint: format!("http://{address}"),
            log,
        })
    }

    fn start(
        directory: &Path,
        name: &str,
        namespace: &str,
        pause: Option<(u64, &Path)>,
    ) -> anyhow::Result<Self> {
        Self::configured(directory, name, namespace, pause, None)
    }

    fn configured(
        directory: &Path,
        name: &str,
        namespace: &str,
        pause: Option<(u64, &Path)>,
        indexing: Option<Option<(u64, &Path)>>,
    ) -> anyhow::Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let address = listener.local_addr()?;
        drop(listener);
        let log = directory.join(format!("{name}.log"));
        let stdout = std::fs::File::create(&log)?;
        let stderr = stdout.try_clone()?;
        let mut command = Command::new(env!("CARGO_BIN_EXE_dfsd-fdb"));
        command
            .args([
                "--cluster-file",
                &std::env::var("DFS_FDB_TEST_CLUSTER_FILE")?,
                "--namespace",
                namespace,
                "--listen",
                &address.to_string(),
                "--cache-bytes",
                "262144",
                "--credentials",
            ])
            .arg(directory.join("credentials.json"))
            .env("RUST_LOG", "dfs_fdb=info")
            .stdin(Stdio::null())
            .stdout(stdout)
            .stderr(stderr);
        if let Some((head, signal)) = pause {
            command
                .arg("--pause-after-publication-head")
                .arg(head.to_string())
                .arg("--publication-signal-file")
                .arg(signal);
        }
        if let Some(pause) = indexing {
            command
                .arg("--elasticsearch")
                .arg(std::env::var("DFS_FDB_TEST_ES")?)
                .arg("--index-tokens")
                .arg(directory.join("admin.token"));
            if let Some((head, signal)) = pause {
                command
                    .arg("--pause-before-index-checkpoint-head")
                    .arg(head.to_string())
                    .arg("--index-signal-file")
                    .arg(signal);
            }
        }
        Ok(Self {
            child: command.spawn()?,
            endpoint: format!("http://{address}"),
            log,
        })
    }

    async fn ready(&mut self) -> anyhow::Result<Client> {
        for _ in 0..100 {
            if let Some(exit) = self.child.try_wait()? {
                anyhow::bail!(
                    "frontend exited {exit}: {}",
                    std::fs::read_to_string(&self.log)?
                );
            }
            if let Ok(client) = Client::connect(&self.endpoint, "admin", None).await {
                return Ok(client);
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        anyhow::bail!(
            "frontend readiness expired: {}",
            std::fs::read_to_string(&self.log)?
        )
    }
}

async fn routed(client: &Client, endpoint: &str) -> anyhow::Result<Client> {
    let channel = Endpoint::from_shared(endpoint.to_owned())?
        .connect_timeout(Duration::from_secs(2))
        .connect()
        .await?;
    Ok(Client {
        rpc: DfsClient::new(channel)
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES),
        session: client.session.clone(),
        counters: client.counters.clone(),
    })
}

async fn assert_watch_removed(endpoint: &str, session: &str) -> anyhow::Result<()> {
    let channel = Endpoint::from_shared(endpoint.to_owned())?
        .connect()
        .await?;
    let mut rpc = tonic::client::Grpc::new(channel);
    rpc.ready().await?;
    let result: std::result::Result<tonic::Response<tonic::Streaming<dfs_fdb::wire::Frame>>, _> =
        rpc.server_streaming(
            tonic::Request::new(encode(&session)?),
            tonic::codegen::http::uri::PathAndQuery::from_static("/dfs.Dfs/Watch"),
            tonic::codec::ProstCodec::default(),
        )
        .await;
    assert_eq!(result.unwrap_err().code(), tonic::Code::Unimplemented);
    Ok(())
}

async fn processes_share_handles_refresh_on_demand_and_resolve_killed_publisher()
-> anyhow::Result<()> {
    let directory = tempfile::tempdir()?;
    let credential = Credential {
        token_hash: token_hash("admin"),
        tenant: "tenant".to_owned(),
        issuer: "test".to_owned(),
        subject: "owner".to_owned(),
        principal: "owner".to_owned(),
        admin: true,
        scope: None,
        expires_ms: now_ms() + 3_600_000,
    };
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![credential])?,
    )?;
    let namespace = format!("process-{}", id());
    let signal = directory.path().join("published.signal");
    let mut first = Frontend::start(directory.path(), "first", &namespace, Some((3, &signal)))?;
    let client = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "second", &namespace, None)?;
    let second_login = second.ready().await?;
    second_login.call(Call::Logout).await?;
    let alternate = routed(&client, &second.endpoint).await?;
    let view = alternate.view().await?;
    let root = view
        .nodes
        .iter()
        .find(|n| n.visible_name == "files")
        .unwrap()
        .node
        .id
        .clone();
    let node = client
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "report".to_owned(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let Reply::Handle(handle, _) = client
        .call(Call::Open {
            node: node.id.clone(),
            write: true,
        })
        .await?
    else {
        anyhow::bail!("open reply")
    };
    assert_watch_removed(&first.endpoint, &client.session.id).await?;
    let updated = alternate
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: b"acknowledged".to_vec(),
            append: false,
            handle: Some(handle.clone()),
        })
        .await?
        .node
        .unwrap();
    let snapshot = client.view().await?;
    assert!(
        snapshot
            .nodes
            .iter()
            .any(|n| n.node.id == node.id && n.node.size == 12)
    );
    let mutation = Mutation::Write {
        node: node.id.clone(),
        base: updated.version.clone(),
        offset: 0,
        data: b"+once".to_vec(),
        append: true,
        handle: Some(handle.clone()),
    };
    let publication = client.prepare_publication(&mutation)?;
    let publishing = client.clone();
    let pending_publication = publication.clone();
    let pending_mutation = mutation.clone();
    let pending = tokio::spawn(async move {
        publishing
            .publish(pending_publication, pending_mutation)
            .await
    });
    tokio::time::timeout(Duration::from_secs(8), async {
        while !signal.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await?;
    assert_eq!(std::fs::read_to_string(&signal)?, "3");
    first.child.kill()?;
    let exit = first.child.wait()?;
    assert!(!exit.success());
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(exit.signal(), Some(9));
    }
    let uncertain = tokio::time::timeout(Duration::from_secs(20), pending).await??;
    assert_eq!(uncertain.unwrap_err().code, libc::ETIMEDOUT);
    let resolved = alternate
        .resolve_publication(publication.clone())
        .await?
        .unwrap();
    assert_eq!(resolved.outcome.head, 3);
    let repeated = alternate.publish(publication, mutation).await?;
    assert_eq!(repeated.receipt, resolved.receipt);
    let mut third = Frontend::start(directory.path(), "third", &namespace, None)?;
    let third_login = third.ready().await?;
    third_login.call(Call::Logout).await?;
    let cold = routed(&client, &third.endpoint).await?;
    let Reply::Data(bytes) = cold
        .call(Call::Read {
            node: node.id.clone(),
            version: None,
            offset: 0,
            size: 128,
            handle: Some(handle.clone()),
        })
        .await?
    else {
        anyhow::bail!("read reply")
    };
    assert_eq!(bytes, b"acknowledged+once");
    let current = resolved.outcome.node.unwrap();
    alternate
        .mutate(Mutation::Unlink {
            parent: root.clone(),
            name: "report".to_owned(),
            expected: current.entry_token,
            directory: false,
        })
        .await?;
    let Reply::Data(retained) = cold
        .call(Call::Read {
            node: node.id.clone(),
            version: None,
            offset: 0,
            size: 128,
            handle: Some(format!("view:{}", node.id)),
        })
        .await?
    else {
        anyhow::bail!("retained read reply")
    };
    assert_eq!(retained, bytes);
    cold.persist_through(resolved.receipt).await?;
    let left = Mutation::Create {
        parent: root.clone(),
        name: "left".to_owned(),
        kind: Kind::File,
        mode: 0o600,
    };
    let right = Mutation::Create {
        parent: root,
        name: "right".to_owned(),
        kind: Kind::File,
        mode: 0o600,
    };
    let (left, right) = tokio::join!(alternate.mutate(left), cold.mutate(right));
    assert_ne!(left?.head, right?.head);
    let final_view = cold.view().await?;
    assert_eq!(final_view.head, 6);
    assert!(final_view.nodes.iter().any(|n| n.visible_name == "left"));
    assert!(final_view.nodes.iter().any(|n| n.visible_name == "right"));
    alternate.call(Call::Close { handle }).await?;
    alternate.call(Call::Logout).await?;
    assert_eq!(cold.call(Call::Head).await.unwrap_err().code, libc::ESTALE);
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/frontend-demand-refresh-process.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed":true,"frontend_processes":3,"publisher_signal":9,
            "crash_boundary":"after shared publication, before RPC reply",
            "resolved_head":3,"final_filesystem_head":6,
            "same_session_and_handle_on_other_frontend":true,
            "on_demand_cross_process_view":true,"watch_rpc_removed":true,"empty_cache_replacement":true,
            "routing":"explicit endpoint switch; automatic affinity routing not tested here"
        }))?,
    )?;
    Ok(())
}

async fn route(client: &Client) -> anyhow::Result<(usize, u64)> {
    let response = client
        .rpc
        .clone()
        .call(encode(&Envelope {
            session: client.session.id.clone(),
            call: Call::Head,
        })?)
        .await?;
    let selected = response
        .metadata()
        .get("x-dfs-route")
        .ok_or_else(|| anyhow::anyhow!("route metadata missing"))?
        .to_str()?
        .parse()?;
    let cached = response
        .metadata()
        .get("x-dfs-cache-bytes")
        .ok_or_else(|| anyhow::anyhow!("cache metadata missing"))?
        .to_str()?
        .parse()?;
    let reply: Result<Reply> = decode(response.into_inner())?;
    anyhow::ensure!(matches!(reply?, Reply::Head { .. }), "head reply");
    Ok((selected, cached))
}

async fn expect_route(client: &Client, expected: usize) -> anyhow::Result<u64> {
    tokio::time::timeout(Duration::from_secs(12), async {
        loop {
            let (selected, bytes) = route(client).await?;
            if selected == expected {
                return Ok::<_, anyhow::Error>(bytes);
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await?
}

async fn affinity_tracks_actual_cache_and_fails_over_inflight_publication() -> anyhow::Result<()> {
    let directory = tempfile::tempdir()?;
    let credential = Credential {
        token_hash: token_hash("admin"),
        tenant: "tenant".to_owned(),
        issuer: "test".to_owned(),
        subject: "owner".to_owned(),
        principal: "owner".to_owned(),
        admin: true,
        scope: None,
        expires_ms: now_ms() + 3_600_000,
    };
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![credential])?,
    )?;
    let namespace = format!("affinity-{}", id());
    let signal = directory.path().join("affinity-publication.signal");
    let mut frontends = Vec::new();
    for index in 0..3 {
        let mut frontend = Frontend::start(
            directory.path(),
            &format!("frontend-{index}"),
            &namespace,
            if index == 0 {
                Some((5, signal.as_path()))
            } else {
                None
            },
        )?;
        frontend.ready().await?.call(Call::Logout).await?;
        frontends.push(frontend);
    }
    let endpoints: Vec<_> = frontends
        .iter()
        .map(|frontend| frontend.endpoint.clone())
        .collect();
    let mut router = Frontend::router(directory.path(), &endpoints)?;
    let mount = router.ready().await?;
    assert_watch_removed(&router.endpoint, &mount.session.id).await?;
    let root = mount
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|n| n.visible_name == "files")
        .unwrap()
        .node
        .id;
    let warm_two = routed(&mount, &endpoints[2]).await?;
    let two = warm_two
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "warm-two".to_owned(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    warm_two
        .mutate(Mutation::Write {
            node: two.id,
            base: two.version,
            offset: 0,
            data: vec![91; 32 << 10],
            append: false,
            handle: None,
        })
        .await?;
    let cached_two = expect_route(&mount, 2).await?;
    assert!(cached_two >= 32 << 10);
    let warm_zero = routed(&mount, &endpoints[0]).await?;
    let zero = warm_zero
        .mutate(Mutation::Create {
            parent: root,
            name: "warm-zero".to_owned(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let mut body = vec![71; 64 << 10];
    body.extend(vec![72; 64 << 10]);
    let updated = warm_zero
        .mutate(Mutation::Write {
            node: zero.id.clone(),
            base: zero.version,
            offset: 0,
            data: body.clone(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    let cached_zero = expect_route(&mount, 0).await?;
    assert!(cached_zero > cached_two);
    for _ in 0..4 {
        assert_eq!(route(&mount).await?.0, 0);
    }
    let mutation = Mutation::Write {
        node: zero.id.clone(),
        base: updated.version,
        offset: 0,
        data: b"+exactly-once".to_vec(),
        append: true,
        handle: None,
    };
    let publication = mount.prepare_publication(&mutation)?;
    let writer = mount.clone();
    let pending = tokio::spawn(async move { writer.publish(publication, mutation).await });
    tokio::time::timeout(Duration::from_secs(8), async {
        while !signal.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await?;
    assert_eq!(std::fs::read_to_string(&signal)?, "5");
    frontends[0].child.kill()?;
    let killed = frontends[0].child.wait()?;
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(killed.signal(), Some(9));
    }
    let outcome = tokio::time::timeout(Duration::from_secs(12), pending).await???;
    assert_eq!(outcome.outcome.head, 5);
    let (survivor, _) = route(&mount).await?;
    assert_ne!(survivor, 0);
    let Reply::Data(bytes) = mount
        .call(Call::Read {
            node: zero.id,
            version: None,
            offset: 0,
            size: MAX_IO_BYTES as u32,
            handle: None,
        })
        .await?
    else {
        anyhow::bail!("read reply")
    };
    body.extend(b"+exactly-once");
    assert_eq!(bytes, body);
    assert!(matches!(
        mount.call(Call::Head).await?,
        Reply::Head { head: 5, .. }
    ));
    mount.persist_through(outcome.receipt).await?;
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/affinity-demand-refresh-process.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed":true,"frontends":3,"routers":1,"initial_warm_route":2,"larger_cache_route":0,
            "cached_two_bytes":cached_two,"cached_zero_bytes":cached_zero,
            "killed_signal":9,"crash_boundary":"after publication before reply",
            "unchanged_client_endpoint":true,"unchanged_session":true,
            "failover_route":survivor,"append_published_once":true,
            "limitation":"router redundancy and VM outage are separate acceptance tests"
        }))?,
    )?;
    Ok(())
}

async fn indexer_process_recovers_after_bulk_acknowledgement_before_checkpoint()
-> anyhow::Result<()> {
    use std::os::unix::process::ExitStatusExt;
    let directory = tempfile::tempdir()?;
    let credential = Credential {
        token_hash: token_hash("admin"),
        tenant: "tenant".into(),
        issuer: "test".into(),
        subject: "owner".into(),
        principal: "owner".into(),
        admin: true,
        scope: None,
        expires_ms: now_ms() + 3_600_000,
    };
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![credential])?,
    )?;
    std::fs::write(directory.path().join("admin.token"), "admin")?;
    let namespace = format!("index-process-{}", id());
    let signal = directory.path().join("index.signal");
    let mut first = Frontend::configured(
        directory.path(),
        "index-first",
        &namespace,
        None,
        Some(Some((2, &signal))),
    )?;
    let client = first.ready().await?;
    let root = client
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|node| node.visible_parent.is_none())
        .unwrap()
        .node
        .id;
    let node = client
        .mutate(Mutation::Create {
            parent: root,
            name: "report.txt".into(),
            kind: Kind::File,
            mode: 0o644,
        })
        .await?
        .node
        .unwrap();
    let node = client
        .mutate(Mutation::Write {
            node: node.id,
            base: node.version,
            offset: 0,
            data: b"durable index event".to_vec(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    tokio::time::timeout(Duration::from_secs(30), async {
        while !signal.exists() {
            anyhow::ensure!(
                first.child.try_wait()?.is_none(),
                "index frontend exited before pause"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        Ok::<_, anyhow::Error>(())
    })
    .await??;
    let es = std::env::var("DFS_FDB_TEST_ES")?
        .split(',')
        .next()
        .unwrap()
        .to_owned();
    let index = dfs_fdb::search::index_name(&client.session.incarnation, &client.session.tenant)?;
    let document = reqwest::get(format!("{es}/{index}/_doc/{}", node.id))
        .await?
        .error_for_status()?
        .json::<serde_json::Value>()
        .await?;
    assert_eq!(document["_source"]["text"], "durable index event");
    first.child.kill()?;
    let killed = first.child.wait()?;
    assert_eq!(killed.signal(), Some(9));
    let mut second = Frontend::configured(
        directory.path(),
        "index-second",
        &namespace,
        None,
        Some(None),
    )?;
    second.ready().await?.call(Call::Logout).await?;
    let survivor = routed(&client, &second.endpoint).await?;
    let Reply::Data(data) = survivor
        .call(Call::Read {
            node: node.id.clone(),
            version: None,
            offset: 0,
            size: 64,
            handle: None,
        })
        .await?
    else {
        anyhow::bail!("read response")
    };
    assert_eq!(data, b"durable index event");
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            let log = std::fs::read_to_string(&second.log)?;
            if log
                .lines()
                .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
                .any(|line| {
                    line["fields"]["message"] == "index checkpoint advanced"
                        && line["fields"]["through"] == 2
                })
            {
                return Ok::<_, anyhow::Error>(());
            }
            anyhow::ensure!(
                second.child.try_wait()?.is_none(),
                "replacement index frontend exited"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await??;
    survivor
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: b"survivor indexed!!!".to_vec(),
            append: false,
            handle: None,
        })
        .await?;
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            let doc = reqwest::get(format!("{es}/{index}/_doc/{}", node.id))
                .await?
                .error_for_status()?
                .json::<serde_json::Value>()
                .await?;
            if doc["_source"]["source_head"] == 3 {
                assert_eq!(doc["_source"]["text"], "survivor indexed!!!");
                return Ok::<_, anyhow::Error>(());
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await??;
    second.child.kill()?;
    second.child.wait()?;
    reqwest::Client::new()
        .delete(format!("{es}/{index}"))
        .send()
        .await?
        .error_for_status()?;
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/index-process.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed":true,"frontends":2,"killed_signal":9,
            "crash_boundary":"after Elasticsearch bulk acknowledgement before shared FoundationDB checkpoint",
            "existing_session_reused":true,"shared_checkpoint_recovered":true,"new_write_indexed":true,
            "limitation":"frontend processes run on one GCP VM; storage spans three VMs; no VM outage tested here"
        }))?,
    )?;
    Ok(())
}

async fn daemon_cache_expires_on_demand_and_keeps_file_generations_coherent() -> anyhow::Result<()>
{
    use dfs_fdb::mount_cache::{Limits, MountCache};
    use std::{sync::atomic::Ordering, time::Instant};
    let directory = tempfile::tempdir()?;
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![Credential {
            token_hash: token_hash("admin"),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: "owner".into(),
            principal: "owner".into(),
            admin: true,
            scope: None,
            expires_ms: now_ms() + 3_600_000,
        }])?,
    )?;
    let namespace = format!("daemon-cache-{}", id());
    let mut first = Frontend::start(directory.path(), "first", &namespace, None)?;
    let reader = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "second", &namespace, None)?;
    let writer = second.ready().await?;
    let cache = MountCache::new(reader.clone(), Limits::default())?;
    let root = cache.lookup(None, "files").await?;
    let root_id = root.item.node.id.clone();
    let mut node = writer
        .mutate(Mutation::Create {
            parent: root_id.clone(),
            name: "file".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let body = vec![b'a'; 2 * CHUNK_BYTES];
    node = writer
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: body.clone(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    tokio::time::sleep(root.freshness.remaining_at(Instant::now()) + Duration::from_millis(5))
        .await;
    let initial = cache.lookup(Some(&root_id), "file").await?;
    assert_eq!(
        cache.read(&initial, 0, MAX_IO_BYTES as u32).await?.bytes,
        body
    );
    let data_calls = reader.counters.data_calls.load(Ordering::Relaxed);
    assert_eq!(
        cache.read(&initial, 0, MAX_IO_BYTES as u32).await?.bytes,
        body
    );
    assert_eq!(
        reader.counters.data_calls.load(Ordering::Relaxed),
        data_calls
    );
    assert_eq!(
        cache.lookup(Some(&root_id), "late").await.unwrap_err().code,
        libc::ENOENT
    );
    writer
        .mutate(Mutation::Create {
            parent: root_id.clone(),
            name: "late".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?;
    let acknowledged = Instant::now();
    let before_idle = reader.counters.calls.load(Ordering::Relaxed);
    tokio::time::sleep(initial.freshness.remaining_at(Instant::now()) + Duration::from_millis(5))
        .await;
    assert_eq!(reader.counters.calls.load(Ordering::Relaxed), before_idle);
    let lookup_started = Instant::now();
    let visible = cache.lookup(Some(&root_id), "late").await?;
    let visible_ms = acknowledged.elapsed().as_secs_f64() * 1000.0;
    let refresh_ms = lookup_started.elapsed().as_secs_f64() * 1000.0;
    assert_eq!(visible.item.node.name, "late");
    node = writer
        .mutate(Mutation::Truncate {
            node: node.id.clone(),
            base: node.version,
            size: 17,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    tokio::time::sleep(visible.freshness.remaining_at(Instant::now()) + Duration::from_millis(5))
        .await;
    assert_eq!(
        cache
            .read(&initial, 0, MAX_IO_BYTES as u32)
            .await
            .err()
            .unwrap()
            .code,
        libc::ESTALE
    );
    let short = cache.object(&node.id).await?;
    let read = cache.read(&short, 0, MAX_IO_BYTES as u32).await?;
    assert_eq!(read.object.item.node.size, 17);
    assert_eq!(read.bytes, vec![b'a'; 17]);
    assert!(cache.read(&short, 17, 1).await?.bytes.is_empty());
    node = writer
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: body.len() as u64,
            data: b"tail".to_vec(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    tokio::time::sleep(short.freshness.remaining_at(Instant::now()) + Duration::from_millis(5))
        .await;
    let grown = cache.object(&node.id).await?;
    let read = cache.read(&grown, 0, MAX_IO_BYTES as u32).await?;
    let mut sparse = vec![0; body.len() + 4];
    sparse[..17].fill(b'a');
    sparse[body.len()..].copy_from_slice(b"tail");
    assert_eq!(read.object.item.node.size as usize, sparse.len());
    assert_eq!(read.bytes, sparse);
    let mtime_ms = node.mtime_ms;
    let replacement = vec![b'b'; sparse.len()];
    node = writer
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: replacement.clone(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    node = writer
        .mutate(Mutation::SetAttr {
            node: node.id.clone(),
            base: node.version,
            mode: None,
            mtime_ms: Some(mtime_ms),
            handle: None,
        })
        .await?
        .node
        .unwrap();
    tokio::time::sleep(grown.freshness.remaining_at(Instant::now()) + Duration::from_millis(5))
        .await;
    assert_eq!(
        cache
            .read(&grown, 0, MAX_IO_BYTES as u32)
            .await
            .err()
            .unwrap()
            .code,
        libc::ESTALE
    );
    let replaced = cache.object(&node.id).await?;
    assert_eq!(replaced.item.node.size, grown.item.node.size);
    assert_eq!(replaced.item.node.mtime_ms, grown.item.node.mtime_ms);
    assert_eq!(
        cache.read(&replaced, 0, MAX_IO_BYTES as u32).await?.bytes,
        replacement
    );
    let listed = cache.directory(Some(&root_id)).await?;
    assert_eq!(
        listed
            .entries
            .iter()
            .map(|entry| entry.item.visible_name.as_str())
            .collect::<Vec<_>>(),
        vec!["file", "late"]
    );
    let mut expired_directory = listed;
    expired_directory.freshness = dfs_fdb::freshness::Freshness::from_validation_started_at(
        Instant::now() - Duration::from_secs(2),
    );
    let calls = reader.counters.calls.load(Ordering::Relaxed);
    let current_directory = cache
        .revalidate_directory(Some(&root_id), &expired_directory, Duration::ZERO)
        .await?;
    assert!(
        !current_directory
            .freshness
            .requires_refresh_at(Instant::now())
    );
    assert_eq!(reader.counters.calls.load(Ordering::Relaxed), calls + 1);
    writer
        .mutate(Mutation::SetAttr {
            node: node.id.clone(),
            base: node.version,
            mode: Some(0o640),
            mtime_ms: None,
            handle: None,
        })
        .await?;
    assert_eq!(
        cache
            .revalidate_directory(Some(&root_id), &expired_directory, Duration::ZERO)
            .await
            .err()
            .unwrap()
            .code,
        libc::ESTALE
    );
    let stats = cache.content_stats();
    assert!(stats.resident_bytes <= stats.capacity_bytes);
    let shutdown_freshness = cache.validation().await?;
    first.child.kill()?;
    first.child.wait()?;
    tokio::time::sleep(shutdown_freshness.remaining_at(Instant::now()) + Duration::from_millis(5))
        .await;
    assert!(cache.read(&replaced, 0, MAX_IO_BYTES as u32).await.is_err());
    assert!(cache.lookup(Some(&root_id), "file").await.is_err());
    std::fs::write(
        "results/cache-rework/daemon-cache-consistency.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed":true,"maximum_cache_age_ms":1000,"server_calls_while_idle":0,
            "remote_create_ack_to_observed_ms":visible_ms,"demand_refresh_ms":refresh_ms,
            "warm_repeat_data_rpcs":0,"truncate_eof_coherent":true,"sparse_growth_coherent":true,
            "same_size_same_mtime_replacement_detected":true,"old_snapshot_read_rejected":true,
            "expired_cache_fails_closed_after_frontend_kill":true,"content_cache":stats,
            "expired_directory_revalidated":true,"changed_directory_reply_rejected":true,
            "scope":"daemon cache API; two independent frontend processes; real FoundationDB; no kernel mount yet"
        }))?,
    )?;
    Ok(())
}

#[cfg(target_os = "linux")]
async fn mounted_metadata_expires_without_stacking_kernel_and_daemon_ttls() -> anyhow::Result<()> {
    use dfs_fdb::{mount::Mount, mount_cache::Limits};
    use std::os::unix::fs::MetadataExt;
    use std::{os::fd::AsRawFd, sync::atomic::Ordering, time::Instant};

    let directory = tempfile::tempdir()?;
    let credential = Credential {
        token_hash: token_hash("admin"),
        tenant: "tenant".to_owned(),
        issuer: "test".to_owned(),
        subject: "owner".to_owned(),
        principal: "owner".to_owned(),
        admin: true,
        scope: None,
        expires_ms: now_ms() + 3_600_000,
    };
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![credential])?,
    )?;
    let namespace = format!("mount-metadata-{}", id());
    let mut first = Frontend::start(directory.path(), "reader", &namespace, None)?;
    let reader = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "writer", &namespace, None)?;
    let writer = second.ready().await?;
    let root = writer
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|item| item.visible_parent.is_none() && item.visible_name == "files")
        .unwrap()
        .node
        .id;
    for index in 0..12 {
        writer
            .mutate(Mutation::Create {
                parent: root.clone(),
                name: format!("entry-{index:02}"),
                kind: Kind::File,
                mode: 0o600,
            })
            .await?;
    }
    let mountpoint = directory.path().join("mount");
    std::fs::create_dir(&mountpoint)?;
    let mount = Mount::new(
        reader.clone(),
        tokio::runtime::Handle::current(),
        Limits::default(),
    )?;
    let counters = mount.counters.clone();
    let session = mount.spawn(
        &mountpoint,
        &[
            fuser::MountOption::FSName("dfs-fdb-metadata-test".to_owned()),
            fuser::MountOption::RO,
            fuser::MountOption::NoAtime,
        ],
    )?;
    let files = mountpoint.join("files");
    assert!(std::fs::metadata(&files)?.is_dir());
    assert_eq!(std::fs::read_dir(&files)?.count(), 12);
    assert!(counters.readdirplus.load(Ordering::Relaxed) > 0);
    let late_path = files.join("late");
    assert_eq!(
        std::fs::metadata(&late_path).unwrap_err().raw_os_error(),
        Some(libc::ENOENT)
    );
    let negative_before = counters.lookup.load(Ordering::Relaxed);
    for _ in 0..20 {
        assert_eq!(
            std::fs::metadata(&late_path).unwrap_err().raw_os_error(),
            Some(libc::ENOENT)
        );
    }
    assert_eq!(counters.lookup.load(Ordering::Relaxed), negative_before);
    let late = writer
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "late".to_owned(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let acknowledged = Instant::now();
    loop {
        match std::fs::metadata(&late_path) {
            Ok(metadata) => {
                assert_eq!(metadata.len(), 0);
                break;
            }
            Err(error) if error.raw_os_error() == Some(libc::ENOENT) => {}
            Err(error) => return Err(error.into()),
        }
        anyhow::ensure!(
            acknowledged.elapsed() < Duration::from_millis(1250),
            "negative lookup exceeded one second plus test RTT allowance"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let create_ms = acknowledged.elapsed().as_secs_f64() * 1000.0;
    let attrs_before = counters.getattr.load(Ordering::Relaxed);
    let lookups_before = counters.lookup.load(Ordering::Relaxed);
    for _ in 0..20 {
        assert_eq!(std::fs::metadata(&late_path)?.len(), 0);
    }
    assert_eq!(counters.getattr.load(Ordering::Relaxed), attrs_before);
    assert_eq!(counters.lookup.load(Ordering::Relaxed), lookups_before);
    assert_eq!(std::fs::read_dir(&files)?.count(), 13);

    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert_eq!(std::fs::metadata(files.join("entry-00"))?.len(), 0);
    tokio::time::sleep(Duration::from_millis(700)).await;
    assert_eq!(std::fs::metadata(&late_path)?.len(), 0);
    let late = writer
        .mutate(Mutation::Write {
            node: late.id,
            base: late.version,
            offset: 0,
            data: b"fresh".to_vec(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    let acknowledged = Instant::now();
    while std::fs::metadata(&late_path)?.len() != 5 {
        anyhow::ensure!(
            acknowledged.elapsed() < Duration::from_millis(650),
            "daemon cache hit granted a new kernel TTL"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let remaining_ttl_ms = acknowledged.elapsed().as_secs_f64() * 1000.0;

    let directory_fd = std::fs::File::open(&files)?;
    let mut buffer = [0u8; 128];
    let read_directory_page = |buffer: &mut [u8]| unsafe {
        libc::syscall(
            libc::SYS_getdents64,
            directory_fd.as_raw_fd(),
            buffer.as_mut_ptr(),
            buffer.len(),
        )
    };
    anyhow::ensure!(read_directory_page(&mut buffer) > 0, "first directory page");
    writer
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "directory-change".to_owned(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert_eq!(read_directory_page(&mut buffer), -1);
    assert_eq!(
        std::io::Error::last_os_error().raw_os_error(),
        Some(libc::ESTALE)
    );
    assert_eq!(
        unsafe { libc::lseek(directory_fd.as_raw_fd(), 0, libc::SEEK_SET) },
        0
    );
    anyhow::ensure!(
        read_directory_page(&mut buffer) > 0,
        "rewound directory page"
    );
    assert_eq!(std::fs::read_dir(&files)?.count(), 14);
    let old_mode = directory_fd.metadata()?.mode() & 0o777;
    let new_mode = if old_mode == 0o700 { 0o750 } else { 0o700 };
    let Reply::Node(root_node) = writer
        .call(Call::Stat {
            node: root.clone(),
            handle: None,
        })
        .await?
    else {
        anyhow::bail!("root stat reply")
    };
    writer
        .mutate(Mutation::SetAttr {
            node: root.clone(),
            base: root_node.version,
            mode: Some(new_mode),
            mtime_ms: None,
            handle: None,
        })
        .await?;
    let acknowledged = Instant::now();
    while directory_fd.metadata()?.mode() & 0o777 != new_mode {
        anyhow::ensure!(
            acknowledged.elapsed() < Duration::from_millis(1250),
            "open directory fstat remained stale"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let fstat_ms = acknowledged.elapsed().as_secs_f64() * 1000.0;
    anyhow::ensure!(
        read_directory_page(&mut buffer) > 0,
        "unchanged entries resume after metadata refresh"
    );
    drop(directory_fd);

    writer
        .mutate(Mutation::Unlink {
            parent: root.clone(),
            name: "late".to_owned(),
            expected: late.entry_token,
            directory: false,
        })
        .await?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert_eq!(
        std::fs::metadata(&late_path).unwrap_err().raw_os_error(),
        Some(libc::ENOENT)
    );
    assert_eq!(std::fs::read_dir(&files)?.count(), 13);

    let destination = writer
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "destination".to_owned(),
            kind: Kind::Directory,
            mode: 0o700,
        })
        .await?
        .node
        .unwrap();
    let moving = writer
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "moving".to_owned(),
            kind: Kind::Directory,
            mode: 0o700,
        })
        .await?
        .node
        .unwrap();
    writer
        .mutate(Mutation::Create {
            parent: moving.id.clone(),
            name: "child".to_owned(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    let moving_fd = std::fs::File::open(files.join("moving"))?;
    let moving_page = |buffer: &mut [u8]| unsafe {
        libc::syscall(
            libc::SYS_getdents64,
            moving_fd.as_raw_fd(),
            buffer.as_mut_ptr(),
            buffer.len(),
        )
    };
    let mut dots = [0u8; 48];
    assert_eq!(moving_page(&mut dots), 48);
    writer
        .mutate(Mutation::Rename {
            parent: root.clone(),
            name: "moving".to_owned(),
            expected: moving.entry_token,
            new_parent: destination.id,
            new_name: "moved".to_owned(),
            destination: None,
        })
        .await?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert_eq!(moving_page(&mut dots), -1);
    assert_eq!(
        std::io::Error::last_os_error().raw_os_error(),
        Some(libc::ESTALE)
    );
    assert_eq!(
        unsafe { libc::lseek(moving_fd.as_raw_fd(), 0, libc::SEEK_SET) },
        0
    );
    assert_eq!(moving_page(&mut dots), 48);
    let parent_record = u16::from_ne_bytes(dots[16..18].try_into()?) as usize;
    let parent_ino = u64::from_ne_bytes(dots[parent_record..parent_record + 8].try_into()?);
    assert_eq!(
        parent_ino,
        std::fs::metadata(files.join("destination"))?.ino()
    );
    assert!(std::fs::metadata(files.join("destination/moved/child"))?.is_file());
    assert_eq!(
        std::fs::metadata(files.join("moving"))
            .unwrap_err()
            .raw_os_error(),
        Some(libc::ENOENT)
    );
    drop(moving_fd);

    let calls_before_idle = reader.counters.calls.load(Ordering::Relaxed);
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert_eq!(
        reader.counters.calls.load(Ordering::Relaxed),
        calls_before_idle
    );
    assert_eq!(std::fs::metadata(files.join("entry-00"))?.len(), 0);
    first.child.kill()?;
    first.child.wait()?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert!(std::fs::metadata(files.join("entry-00")).is_err());
    assert!(std::fs::read_dir(&files).is_err());
    session.shutdown()?;
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/mounted-metadata-consistency.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed": true,
            "scope": "real Linux FUSE metadata callbacks; independent reader and writer frontend processes; RPC uploader; real FoundationDB; file-data callbacks not yet implemented",
            "remote_create_ack_to_stat_ms": create_ms,
            "write_ack_to_new_size_after_700ms_daemon_hit_ms": remaining_ttl_ms,
            "setattr_ack_to_open_directory_fstat_ms": fstat_ms,
            "readdirplus_used": true,
            "kernel_negative_cache_hits_without_callbacks": 20,
            "kernel_attribute_cache_hits_without_callbacks": 20,
            "changed_directory_continuation_requires_rewind": true,
            "unchanged_directory_continuation_renews_after_expiry": true,
            "moved_directory_dotdot_refreshes_after_rewind": true,
            "remote_unlink_expires": true,
            "server_calls_while_idle": 0,
            "expired_metadata_fails_closed_after_frontend_kill": true,
            "mount_counters": {
                "lookup": counters.lookup.load(Ordering::Relaxed),
                "getattr": counters.getattr.load(Ordering::Relaxed),
                "readdir": counters.readdir.load(Ordering::Relaxed),
                "negative": counters.negative.load(Ordering::Relaxed),
                "expired_directory": counters.expired_directory.load(Ordering::Relaxed),
            },
            "client_counters": reader.counters.snapshot(),
        }))?,
    )?;
    Ok(())
}

#[cfg(target_os = "linux")]
async fn mounted_files_follow_live_generations_and_fence_competing_writers() -> anyhow::Result<()> {
    use dfs_fdb::{mount::Mount, mount_cache::Limits};
    use std::{
        io::{Read, Write},
        os::unix::fs::{FileExt, MetadataExt},
        sync::atomic::Ordering,
        time::Instant,
    };

    let directory = tempfile::tempdir()?;
    let credential = Credential {
        token_hash: token_hash("admin"),
        tenant: "tenant".to_owned(),
        issuer: "test".to_owned(),
        subject: "owner".to_owned(),
        principal: "owner".to_owned(),
        admin: true,
        scope: None,
        expires_ms: now_ms() + 3_600_000,
    };
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![credential])?,
    )?;
    let namespace = format!("mounted-files-{}", id());
    let mut first = Frontend::start(directory.path(), "writer", &namespace, None)?;
    let a = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "reader", &namespace, None)?;
    let b = second.ready().await?;
    let mut sessions = Vec::new();
    let mut mounts = Vec::new();
    let mut counters = Vec::new();
    for (name, client) in [("a", a.clone()), ("b", b.clone())] {
        let path = directory.path().join(name);
        std::fs::create_dir(&path)?;
        let mount = Mount::new(client, tokio::runtime::Handle::current(), Limits::default())?;
        counters.push(mount.counters.clone());
        sessions.push(mount.spawn(
            &path,
            &[
                fuser::MountOption::FSName("dfs-fdb-files-test".to_owned()),
                fuser::MountOption::NoAtime,
            ],
        )?);
        mounts.push(path.join("files"));
    }
    let written = mounts[0].join("file");
    let observed = mounts[1].join("file");
    assert_eq!(
        std::fs::metadata(&observed).unwrap_err().raw_os_error(),
        Some(libc::ENOENT)
    );
    let initial = vec![b'a'; 3 * CHUNK_BYTES + 137];
    std::fs::write(&written, &initial)?;
    let acknowledged = Instant::now();
    loop {
        match std::fs::metadata(&observed) {
            Ok(metadata) if metadata.len() == initial.len() as u64 => break,
            Ok(_) => {}
            Err(error) if error.raw_os_error() == Some(libc::ENOENT) => {}
            Err(error) => return Err(error.into()),
        }
        anyhow::ensure!(
            acknowledged.elapsed() < Duration::from_millis(1300),
            "mounted upload visibility deadline"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let visible_ms = acknowledged.elapsed().as_secs_f64() * 1000.0;
    let mut snapshot = std::fs::File::open(&observed)?;
    let old_stat = snapshot.metadata()?;
    let mut bytes = Vec::new();
    snapshot.read_to_end(&mut bytes)?;
    assert_eq!(bytes, initial);
    let read_callbacks = counters[1].read.load(Ordering::Relaxed);
    let cached_reads = counters[1].cached_read.load(Ordering::Relaxed);
    let data_calls = b.counters.data_calls.load(Ordering::Relaxed);
    let mut warm = vec![0; initial.len()];
    snapshot.read_exact_at(&mut warm, 0)?;
    assert_eq!(warm, initial);
    assert!(counters[1].read.load(Ordering::Relaxed) > read_callbacks);
    assert!(counters[1].cached_read.load(Ordering::Relaxed) > cached_reads);
    assert_eq!(b.counters.data_calls.load(Ordering::Relaxed), data_calls);

    let mut writer = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&written)?;
    let replacement = vec![b'b'; initial.len()];
    writer.write_all(&replacement)?;
    writer.set_times(std::fs::FileTimes::new().set_modified(old_stat.modified()?))?;
    writer.sync_all()?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    let mut old_bytes = vec![0; initial.len()];
    snapshot.read_exact_at(&mut old_bytes, 0)?;
    assert_eq!(old_bytes, replacement);
    assert_eq!(snapshot.metadata()?.len(), initial.len() as u64);
    let mut current = std::fs::File::open(&observed)?;
    assert_eq!(current.metadata()?.ino(), old_stat.ino());
    assert_eq!(current.metadata()?.modified()?, old_stat.modified()?);
    let mut current_bytes = Vec::new();
    current.read_to_end(&mut current_bytes)?;
    assert_eq!(current_bytes, replacement);

    writer.set_len(7)?;
    writer.write_all_at(b"tail", (2 * CHUNK_BYTES) as u64)?;
    writer.sync_all()?;
    let mut own = vec![0; 2 * CHUNK_BYTES + 4];
    writer.read_exact_at(&mut own, 0)?;
    assert_eq!(&own[..7], b"bbbbbbb");
    assert!(own[7..2 * CHUNK_BYTES].iter().all(|byte| *byte == 0));
    assert_eq!(&own[2 * CHUNK_BYTES..], b"tail");
    tokio::time::sleep(Duration::from_millis(1100)).await;
    let mut second_snapshot = vec![0; own.len()];
    current.read_exact_at(&mut second_snapshot, 0)?;
    assert_eq!(second_snapshot, own);
    assert_eq!(current.metadata()?.len(), own.len() as u64);
    assert_eq!(std::fs::read(&observed)?, own);
    assert_eq!(std::fs::metadata(&observed)?.len(), own.len() as u64);
    let mut local_snapshot = std::fs::File::open(&written)?;
    let local_size = local_snapshot.metadata()?.len();
    let mut separate_writer = std::fs::OpenOptions::new().write(true).open(&written)?;
    separate_writer.write_all(b"new")?;
    separate_writer.sync_all()?;
    let mut local_bytes = Vec::new();
    local_snapshot.read_to_end(&mut local_bytes)?;
    own[..3].copy_from_slice(b"new");
    assert_eq!(local_bytes, own);
    assert_eq!(local_snapshot.metadata()?.len(), local_size);
    drop(separate_writer);

    std::fs::remove_file(&written)?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    old_bytes.resize(own.len(), 0);
    snapshot.read_exact_at(&mut old_bytes, 0)?;
    assert_eq!(old_bytes, own);
    assert_eq!(
        std::fs::metadata(&observed).unwrap_err().raw_os_error(),
        Some(libc::ENOENT)
    );
    drop(writer);
    drop(snapshot);
    drop(current);
    drop(local_snapshot);

    let folder = mounts[0].join("folder");
    std::fs::create_dir(&folder)?;
    std::fs::File::open(&folder)?.sync_all()?;
    std::fs::write(folder.join("source"), b"source")?;
    std::fs::write(folder.join("target"), b"target")?;
    let old_target = std::fs::File::open(folder.join("target"))?;
    std::fs::rename(folder.join("source"), folder.join("target"))?;
    let mut target_bytes = [0u8; 6];
    old_target.read_exact_at(&mut target_bytes, 0)?;
    assert_eq!(&target_bytes, b"target");
    assert_eq!(std::fs::read(folder.join("target"))?, b"source");
    std::fs::remove_file(folder.join("target"))?;
    std::fs::remove_dir(&folder)?;
    drop(old_target);

    let contested_a = mounts[0].join("contested");
    let contested_b = mounts[1].join("contested");
    std::fs::write(&contested_a, b"start")?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    let before_race = std::fs::File::open(&contested_b)?;
    let racer_a = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&contested_a)?;
    let racer_b = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&contested_b)?;
    let barrier = std::sync::Barrier::new(2);
    let (race_a, race_b) = std::thread::scope(|scope| {
        let a = scope.spawn(|| {
            barrier.wait();
            racer_a.write_at(&vec![b'x'; CHUNK_BYTES], 0)
        });
        let b = scope.spawn(|| {
            barrier.wait();
            racer_b.write_at(&vec![b'y'; CHUNK_BYTES], 0)
        });
        (a.join().unwrap(), b.join().unwrap())
    });
    assert_ne!(race_a.is_ok(), race_b.is_ok());
    let (winner, loser) = if race_a.is_ok() {
        (b'x', race_b)
    } else {
        (b'y', race_a)
    };
    assert_eq!(loser.unwrap_err().raw_os_error(), Some(libc::ESTALE));
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert_eq!(std::fs::read(&contested_a)?, vec![winner; CHUNK_BYTES]);
    assert_eq!(std::fs::read(&contested_b)?, vec![winner; CHUNK_BYTES]);
    let mut current_winner = vec![0; CHUNK_BYTES];
    before_race.read_exact_at(&mut current_winner, 0)?;
    assert_eq!(current_winner, vec![winner; CHUNK_BYTES]);
    assert_eq!(before_race.metadata()?.len(), CHUNK_BYTES as u64);
    drop(racer_a);
    drop(racer_b);
    drop(before_race);
    for session in sessions {
        session.shutdown()?;
    }
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/mounted-files-consistency.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed": true,
            "scope": "two real FUSE mounts in one GCP test process; separate frontend processes; real FoundationDB; live descriptors with direct I/O and immutable daemon cache",
            "upload_ack_to_visible_ms": visible_ms,
            "warm_read_uses_fuse_callback": true,
            "warm_read_uses_synchronous_client_cache": true,
            "warm_kernel_read_extra_data_rpcs": 0,
            "same_size_same_mtime_rewrite_updates_existing_descriptor": true,
            "stable_inode_across_generations": true,
            "truncate_and_sparse_growth_match_size": true,
            "writable_descriptor_reads_own_writes": true,
            "same_mount_reader_observes_acknowledged_writer": true,
            "open_unlink_snapshot_survives": true,
            "rename_replacement_preserves_open_target": true,
                        "concurrent_winner": String::from_utf8(vec![winner])?,
            "concurrent_loser_errno": libc::ESTALE,
            "existing_descriptor_observes_concurrent_winner_after_expiry": true,
            "file_callbacks": {
                "a_read": counters[0].read.load(Ordering::Relaxed), "a_write": counters[0].write.load(Ordering::Relaxed),
                "b_read": counters[1].read.load(Ordering::Relaxed), "b_write": counters[1].write.load(Ordering::Relaxed),
            },
        }))?,
    )?;
    Ok(())
}

#[cfg(target_os = "linux")]
async fn mounted_live_authority_expires_even_when_path_metadata_remains_visible()
-> anyhow::Result<()> {
    use dfs_fdb::{mount::Mount, mount_cache::Limits};
    use std::{os::unix::fs::FileExt, sync::atomic::Ordering};
    let directory = tempfile::tempdir()?;
    let admin = Credential {
        token_hash: token_hash("admin"),
        tenant: "tenant".to_owned(),
        issuer: "test".to_owned(),
        subject: "owner".to_owned(),
        principal: "owner".to_owned(),
        admin: true,
        scope: None,
        expires_ms: now_ms() + 3_600_000,
    };
    let reader_credential = Credential {
        token_hash: token_hash("reader"),
        subject: "reader".to_owned(),
        principal: "reader".to_owned(),
        admin: false,
        ..admin.clone()
    };
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![admin, reader_credential])?,
    )?;
    let namespace = format!("mount-authority-{}", id());
    let mut first = Frontend::start(directory.path(), "writer", &namespace, None)?;
    let writer = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "reader", &namespace, None)?;
    second.ready().await?.call(Call::Logout).await?;
    let reader = Client::connect(&second.endpoint, "reader", None).await?;
    let root = writer
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|node| node.visible_name == "files")
        .unwrap()
        .node
        .id;
    let file = writer
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "secret".to_owned(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let bytes = vec![b's'; 8192];
    writer
        .mutate(Mutation::Write {
            node: file.id,
            base: file.version,
            offset: 0,
            data: bytes.clone(),
            append: false,
            handle: None,
        })
        .await?;
    writer
        .mutate(Mutation::Grant {
            node: root.clone(),
            subject: "reader".to_owned(),
            verbs: READ | LIST | TRAVERSE,
        })
        .await?;
    let mountpoint = directory.path().join("mount");
    std::fs::create_dir(&mountpoint)?;
    let mount = Mount::new(
        reader.clone(),
        tokio::runtime::Handle::current(),
        Limits::default(),
    )?;
    let session = mount.spawn(
        &mountpoint,
        &[
            fuser::MountOption::FSName("dfs-fdb-authority-test".to_owned()),
            fuser::MountOption::RO,
        ],
    )?;
    let path = mountpoint.join("files/secret");
    let snapshot = std::fs::File::open(&path)?;
    let mut actual = vec![0; bytes.len()];
    snapshot.read_exact_at(&mut actual, 0)?;
    assert_eq!(actual, bytes);
    writer
        .mutate(Mutation::Grant {
            node: root.clone(),
            subject: "reader".to_owned(),
            verbs: LIST | TRAVERSE,
        })
        .await?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert_eq!(std::fs::metadata(&path)?.len(), bytes.len() as u64);
    let denied = snapshot.read_at(&mut actual, 0).unwrap_err();
    assert!(
        matches!(denied.raw_os_error(), Some(libc::EACCES | libc::EIO)),
        "{denied}"
    );
    assert_eq!(
        std::fs::File::open(&path).unwrap_err().raw_os_error(),
        Some(libc::EACCES)
    );
    writer
        .mutate(Mutation::Grant {
            node: root,
            subject: "reader".to_owned(),
            verbs: READ | LIST | TRAVERSE,
        })
        .await?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    snapshot.read_exact_at(&mut actual, 0)?;
    assert_eq!(actual, bytes);
    second.child.kill()?;
    second.child.wait()?;
    let before_idle = reader.counters.calls.load(Ordering::Relaxed);
    tokio::time::sleep(Duration::from_millis(1100)).await;
    assert_eq!(reader.counters.calls.load(Ordering::Relaxed), before_idle);
    assert!(snapshot.read_at(&mut actual, 0).is_err());
    assert!(std::fs::metadata(&path).is_err());
    drop(snapshot);
    session.shutdown()?;
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/mounted-snapshot-authority.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed": true,
            "scope": "real direct-I/O FUSE descriptor with cached daemon bytes; separate reader and writer frontend processes; real FoundationDB",
            "metadata_only_permission_does_not_renew_old_read_authority": true,
            "warmed_daemon_read_denied_after_revocation": true,
            "read_errno_after_revocation": denied.raw_os_error(),
            "new_open_denied_after_revocation": true,
            "existing_descriptor_readable_after_regrant": true,
            "expired_read_fails_after_frontend_kill": true,
            "expired_path_stat_fails_after_frontend_kill": true,
            "server_calls_while_idle": 0,
        }))?,
    )?;
    Ok(())
}

#[cfg(target_os = "linux")]
#[derive(Clone)]
struct DelayedRead {
    upstream: DfsClient<tonic::transport::Channel>,
    armed: std::sync::Arc<std::sync::atomic::AtomicBool>,
    captured: std::sync::Arc<tokio::sync::Notify>,
    release: std::sync::Arc<tokio::sync::Notify>,
}

#[cfg(target_os = "linux")]
#[tonic::async_trait]
impl dfs_fdb::wire::dfs_server::Dfs for DelayedRead {
    async fn call(
        &self,
        request: tonic::Request<dfs_fdb::wire::Frame>,
    ) -> std::result::Result<tonic::Response<dfs_fdb::wire::Frame>, tonic::Status> {
        let envelope: Envelope = decode(request.get_ref().clone())
            .map_err(|error| tonic::Status::invalid_argument(error.to_string()))?;
        let delay = (matches!(&envelope.call, Call::Read { size, .. } if *size > 0)
            || matches!(&envelope.call, Call::ReadBlocks { ranges } if ranges.iter().any(|r| r.size > 0)))
            && self.armed.swap(false, std::sync::atomic::Ordering::SeqCst);
        let response = self.upstream.clone().call(request).await?;
        if delay {
            self.captured.notify_one();
            self.release.notified().await;
        }
        Ok(response)
    }

    type SnapshotStream = tonic::Streaming<dfs_fdb::wire::Frame>;

    async fn snapshot(
        &self,
        request: tonic::Request<dfs_fdb::wire::Frame>,
    ) -> std::result::Result<tonic::Response<Self::SnapshotStream>, tonic::Status> {
        self.upstream.clone().snapshot(request).await
    }
}

#[cfg(target_os = "linux")]
async fn delayed_read_is_revalidated_after_remote_truncate() -> anyhow::Result<()> {
    use dfs_fdb::{mount::Mount, mount_cache::Limits};
    use std::{io::Read, os::unix::fs::MetadataExt, sync::Arc};
    let directory = tempfile::tempdir()?;
    let credential = Credential {
        token_hash: token_hash("admin"),
        tenant: "tenant".to_owned(),
        issuer: "test".to_owned(),
        subject: "owner".to_owned(),
        principal: "owner".to_owned(),
        admin: true,
        scope: None,
        expires_ms: now_ms() + 3_600_000,
    };
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![credential])?,
    )?;
    let namespace = format!("delayed-kernel-read-{}", id());
    let mut first = Frontend::start(directory.path(), "writer", &namespace, None)?;
    let writer = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "reader", &namespace, None)?;
    let reader = second.ready().await?;
    let proxy = DelayedRead {
        upstream: reader.rpc.clone(),
        armed: Arc::new(std::sync::atomic::AtomicBool::new(true)),
        captured: Arc::new(tokio::sync::Notify::new()),
        release: Arc::new(tokio::sync::Notify::new()),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}", listener.local_addr()?);
    let (stop, stopping) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(
        tonic::transport::Server::builder()
            .add_service(dfs_fdb::wire::dfs_server::DfsServer::new(proxy.clone()))
            .serve_with_incoming_shutdown(
                tokio_stream::wrappers::TcpListenerStream::new(listener),
                async {
                    let _ = stopping.await;
                },
            ),
    );
    let mounted_client = Client::connect(&endpoint, "admin", None).await?;
    let mut mounts = Vec::new();
    let mut sessions = Vec::new();
    for (name, client) in [("a", writer), ("b", mounted_client)] {
        let path = directory.path().join(name);
        std::fs::create_dir(&path)?;
        sessions.push(
            Mount::new(client, tokio::runtime::Handle::current(), Limits::default())?
                .spawn(&path, &[fuser::MountOption::NoAtime])?,
        );
        mounts.push(path.join("files").join("delayed"));
    }
    let original = vec![b'o'; 3 * CHUNK_BYTES + 137];
    std::fs::write(&mounts[0], &original)?;
    let mut held = std::fs::File::open(&mounts[1])?;
    let inode = held.metadata()?.ino();
    let pending = tokio::task::spawn_blocking(move || -> std::io::Result<_> {
        let mut bytes = Vec::new();
        held.read_to_end(&mut bytes)?;
        Ok((held, bytes))
    });
    tokio::time::timeout(Duration::from_secs(5), proxy.captured.notified()).await?;
    let probe = mounts[1].with_file_name("dispatch-probe");
    let metadata = tokio::task::spawn_blocking(move || std::fs::metadata(probe));
    let dispatched = tokio::time::timeout(Duration::from_secs(2), metadata).await;
    if dispatched.is_err() {
        proxy.release.notify_one();
    }
    assert_eq!(
        dispatched??.unwrap_err().kind(),
        std::io::ErrorKind::NotFound
    );
    std::fs::write(&mounts[0], b"new")?;
    tokio::time::sleep(Duration::from_millis(1100)).await;
    proxy.release.notify_one();
    let (held, bytes) = pending.await??;
    assert_eq!(bytes, b"new");
    assert_eq!(held.metadata()?.len(), 3);
    assert_eq!(std::fs::read(&mounts[1])?, b"new");
    assert_eq!(std::fs::metadata(&mounts[1])?.ino(), inode);
    drop(held);
    for session in sessions {
        session.shutdown()?;
    }
    let _ = stop.send(());
    server.await??;
    std::fs::write(
        "results/cache-rework/mounted-delayed-read.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed": true,
            "scope": "real FUSE, two frontend processes and mounts, proxy holds first nonempty read reply after upstream completed",
            "reply_released_after_remote_truncate_and_metadata_expiry": true,
            "metadata_dispatch_proceeds_while_content_reply_is_held": true,
            "late_reply_discarded_and_read_retried_on_current_generation": true,
            "same_inode_returns_only_current_generation": true,
        }))?,
    )?;
    Ok(())
}

async fn live_cache_shares_validation_and_uses_local_read_handles() -> anyhow::Result<()> {
    use dfs_fdb::mount_cache::{Limits, MountCache};
    use std::{sync::atomic::Ordering, time::Instant};
    let directory = tempfile::tempdir()?;
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![Credential {
            token_hash: token_hash("admin"),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: "owner".into(),
            principal: "owner".into(),
            admin: true,
            scope: None,
            expires_ms: now_ms() + 3_600_000,
        }])?,
    )?;
    let namespace = format!("live-cache-{}", id());
    let mut first = Frontend::start(directory.path(), "first", &namespace, None)?;
    let reader = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "second", &namespace, None)?;
    let writer = second.ready().await?;
    let root = writer
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|item| item.visible_parent.is_none())
        .unwrap()
        .node;
    let mut node = writer
        .mutate(Mutation::Create {
            parent: root.id.clone(),
            name: "live".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    node = writer
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: b"before".to_vec(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    let cache = MountCache::new(reader.clone(), Limits::default())?;
    let mut opened = cache.open_file(&node.id, libc::O_RDONLY).await?;
    assert_eq!(cache.read_file(&mut opened, 0, 64).await?.bytes, b"before");
    let foreign_cache = MountCache::new(writer.clone(), Limits::default())?;
    assert_eq!(
        foreign_cache
            .refresh_file(&mut opened)
            .await
            .unwrap_err()
            .code,
        libc::EACCES
    );
    assert_eq!(
        foreign_cache.file_metadata(&opened).await.unwrap_err().code,
        libc::EACCES
    );
    let fresh = cache.validation().await?;
    let initial_calls = reader.counters.calls.load(Ordering::Relaxed);
    let initial_snapshots = reader.counters.snapshot_calls.load(Ordering::Relaxed);
    for _ in 0..100 {
        let mut temporary = cache.open_file(&node.id, libc::O_RDONLY).await?;
        cache.refresh_file(&mut temporary).await?;
        assert_eq!(
            cache.read_file(&mut temporary, 0, 64).await?.bytes,
            b"before"
        );
        cache.sync_file(&mut temporary).await?;
        cache.close_file(temporary).await?;
    }
    assert!(!fresh.requires_refresh_at(Instant::now()));
    assert_eq!(reader.counters.calls.load(Ordering::Relaxed), initial_calls);
    let old_mtime_ms = node.mtime_ms;
    node = writer
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: b"after!".to_vec(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    node = writer
        .mutate(Mutation::SetAttr {
            node: node.id.clone(),
            base: node.version,
            mode: None,
            mtime_ms: Some(old_mtime_ms),
            handle: None,
        })
        .await?
        .node
        .unwrap();
    tokio::time::sleep(fresh.remaining_at(Instant::now()) + Duration::from_millis(5)).await;
    let heads_before = reader.counters.head_calls.load(Ordering::Relaxed);
    let refresh_started = Instant::now();
    let refreshed = cache.read_file(&mut opened, 0, 64).await?;
    let refresh_elapsed = refresh_started.elapsed();
    assert_eq!(refreshed.bytes, b"after!");
    assert_eq!(refreshed.node.size, 6);
    assert_eq!(refreshed.node.mtime_ms, old_mtime_ms);
    let validation_rpcs = reader.counters.head_calls.load(Ordering::Relaxed) - heads_before;
    assert!(validation_rpcs >= 1);
    if refresh_elapsed < Duration::from_secs(1) {
        assert_eq!(validation_rpcs, 1);
    }
    assert_eq!(
        reader.counters.snapshot_calls.load(Ordering::Relaxed),
        initial_snapshots
    );
    let calls_before = reader.counters.calls.load(Ordering::Relaxed);
    let temporary = cache.open_file(&node.id, libc::O_RDONLY).await?;
    cache.close_file(temporary).await?;
    cache.refresh_file(&mut opened).await?;
    assert_eq!(reader.counters.calls.load(Ordering::Relaxed), calls_before);
    writer
        .mutate(Mutation::Unlink {
            parent: root.id,
            name: "live".into(),
            expected: node.entry_token,
            directory: false,
        })
        .await?;
    tokio::time::sleep(refreshed.freshness.remaining_at(Instant::now()) + Duration::from_millis(5))
        .await;
    let unlinked = cache.read_file(&mut opened, 0, 64).await?;
    assert_eq!(unlinked.bytes, b"after!");
    assert!(unlinked.node.unlinked);
    first.child.kill()?;
    first.child.wait()?;
    tokio::time::sleep(unlinked.freshness.remaining_at(Instant::now()) + Duration::from_millis(5))
        .await;
    assert!(cache.read_file(&mut opened, 0, 64).await.is_err());
    cache.close_file(opened).await?;
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/local-read-handles.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed": true,
            "cached_open_read_stat_flush_close_iterations": 100,
            "extra_rpcs_within_validation_window": 0,
            "foreign_session_handle_rejected_on_cached_path": true,
            "same_open_handle_follows_same_size_same_mtime_rewrite": true,
            "validation_rpcs_for_changed_head": validation_rpcs,
            "changed_head_read_elapsed_ms": refresh_elapsed.as_millis(),
            "extra_full_snapshots_for_ordinary_edit": 0,
            "unlinked_file_readable_through_view_pin": true,
            "unlinked_attribute_refreshed": true,
            "expired_read_fails_after_frontend_kill": true,
            "scope": "daemon API, two independent frontends and real FoundationDB; kernel cache not covered"
        }))?,
    )?;
    Ok(())
}

#[cfg(target_os = "linux")]
async fn mounted_live_descriptors_refresh_contents_and_preserve_identity() -> anyhow::Result<()> {
    use dfs_fdb::{mount::Mount, mount_cache::Limits};
    use std::os::fd::AsRawFd;
    use std::{
        os::unix::fs::{FileExt, MetadataExt},
        sync::atomic::Ordering,
    };
    struct Mapping(*mut libc::c_void, usize);
    impl Drop for Mapping {
        fn drop(&mut self) {
            if self.0 != libc::MAP_FAILED {
                unsafe {
                    libc::munmap(self.0, self.1);
                }
            }
        }
    }
    let directory = tempfile::tempdir()?;
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![Credential {
            token_hash: token_hash("admin"),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: "owner".into(),
            principal: "owner".into(),
            admin: true,
            scope: None,
            expires_ms: now_ms() + 3_600_000,
        }])?,
    )?;
    let namespace = format!("live-mounted-{}", id());
    let mut first = Frontend::start(directory.path(), "writer", &namespace, None)?;
    let a = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "reader", &namespace, None)?;
    let b = second.ready().await?;
    let mut sessions = Vec::new();
    let mut paths = Vec::new();
    for (name, client) in [("a", a.clone()), ("b", b.clone())] {
        let path = directory.path().join(name);
        std::fs::create_dir(&path)?;
        let mount = Mount::new(client, tokio::runtime::Handle::current(), Limits::default())?;
        sessions.push(mount.spawn(
            &path,
            &[
                fuser::MountOption::FSName("dfs-fdb-live-test".into()),
                fuser::MountOption::NoAtime,
            ],
        )?);
        paths.push(path.join("files"));
    }
    let written = paths[0].join("file");
    let observed = paths[1].join("file");
    let initial = vec![b'a'; 2 * CHUNK_BYTES + 17];
    std::fs::write(&written, &initial)?;
    let reader = std::fs::File::open(&observed)?;
    let old_stat = reader.metadata()?;
    let shared = Mapping(
        unsafe {
            libc::mmap(
                std::ptr::null_mut(),
                4096,
                libc::PROT_READ,
                libc::MAP_SHARED,
                reader.as_raw_fd(),
                0,
            )
        },
        4096,
    );
    assert_eq!(shared.0, libc::MAP_FAILED);
    assert_eq!(
        std::io::Error::last_os_error().raw_os_error(),
        Some(libc::ENODEV)
    );
    let private = Mapping(
        unsafe {
            libc::mmap(
                std::ptr::null_mut(),
                4096,
                libc::PROT_READ,
                libc::MAP_PRIVATE,
                reader.as_raw_fd(),
                0,
            )
        },
        4096,
    );
    anyhow::ensure!(private.0 != libc::MAP_FAILED, "private mapping failed");
    assert_eq!(unsafe { *(private.0 as *const u8) }, b'a');

    let mut buffer = vec![0; initial.len()];
    reader.read_exact_at(&mut buffer, 0)?;
    assert_eq!(buffer, initial);
    let data_calls = b.counters.data_calls.load(Ordering::Relaxed);
    let calls = b.counters.calls.load(Ordering::Relaxed);
    reader.read_exact_at(&mut buffer, 0)?;
    assert_eq!(buffer, initial);
    for _ in 0..50 {
        let temporary = std::fs::File::open(&observed)?;
        assert_eq!(temporary.metadata()?.len(), initial.len() as u64);
        drop(temporary);
    }
    assert_eq!(b.counters.data_calls.load(Ordering::Relaxed), data_calls);
    assert_eq!(b.counters.calls.load(Ordering::Relaxed), calls);
    let writer = std::fs::OpenOptions::new().write(true).open(&written)?;
    let replacement = vec![b'b'; initial.len()];
    writer.write_all_at(&replacement, 0)?;
    writer.sync_all()?;
    let node = a
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|item| item.node.name == "file")
        .unwrap()
        .node;
    a.mutate(Mutation::SetAttr {
        node: node.id.clone(),
        base: node.version,
        mode: None,
        mtime_ms: Some((old_stat.mtime() as u64) * 1000 + old_stat.mtime_nsec() as u64 / 1_000_000),
        handle: None,
    })
    .await?;
    tokio::time::sleep(Duration::from_millis(1050)).await;
    reader.read_exact_at(&mut buffer, 0)?;
    assert_eq!(buffer, replacement);
    assert_eq!(reader.metadata()?.ino(), old_stat.ino());
    assert_eq!(reader.metadata()?.mtime(), old_stat.mtime());
    assert_eq!(reader.metadata()?.mtime_nsec(), old_stat.mtime_nsec());
    assert_eq!(std::fs::metadata(&observed)?.ino(), old_stat.ino());
    drop(private);
    drop(shared);
    assert_eq!(
        writer.set_len(3).unwrap_err().raw_os_error(),
        Some(libc::ESTALE)
    );
    assert_eq!(writer.metadata()?.len(), initial.len() as u64);
    writer.set_len(3)?;
    tokio::time::sleep(Duration::from_millis(1050)).await;
    assert_eq!(reader.read_at(&mut buffer, 0)?, 3);
    assert_eq!(&buffer[..3], b"bbb");
    assert_eq!(reader.read_at(&mut buffer, 3)?, 0);
    assert_eq!(reader.metadata()?.len(), 3);
    writer.write_all_at(b"tail", 3)?;
    tokio::time::sleep(Duration::from_millis(1050)).await;
    assert_eq!(reader.read_at(&mut buffer, 3)?, 4);
    assert_eq!(&buffer[..4], b"tail");
    assert_eq!(reader.metadata()?.len(), 7);
    std::fs::write(paths[0].join("replacement"), b"new identity")?;
    std::fs::rename(paths[0].join("replacement"), &written)?;
    tokio::time::sleep(Duration::from_millis(1050)).await;
    assert_eq!(std::fs::read(&observed)?, b"new identity");
    assert_eq!(reader.read_at(&mut buffer, 0)?, 7);
    assert_eq!(&buffer[..7], b"bbbtail");
    assert_eq!(reader.metadata()?.nlink(), 0);
    assert_eq!(reader.metadata()?.ino(), old_stat.ino());
    writer.write_all_at(b"old", 0)?;
    tokio::time::sleep(Duration::from_millis(1050)).await;
    reader.read_exact_at(&mut buffer[..7], 0)?;
    assert_eq!(&buffer[..7], b"oldtail");
    assert_eq!(std::fs::read(&observed)?, b"new identity");
    drop(writer);
    second.child.kill()?;
    second.child.wait()?;
    tokio::time::sleep(Duration::from_millis(1050)).await;
    assert!(reader.read_at(&mut buffer, 0).is_err());
    drop(reader);
    for session in sessions {
        session.shutdown()?;
    }
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/mounted-live-descriptors.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed": true,
            "scope": "two real FUSE mounts, independent frontend processes, real three-store FoundationDB cluster",
            "same_descriptor_same_size_same_mtime_rewrite": true,
            "same_descriptor_shrink_and_append": true,
            "stable_inode_across_edits": true,
            "warm_read_has_no_data_rpc": true,
            "cached_open_fstat_close_iterations": 50,
            "cached_open_fstat_close_extra_rpcs": 0,
            "rename_replacement_preserves_original_descriptor_identity": true,
            "unlinked_writer_and_reader_follow_original_live_file": true,
            "expired_read_fails_after_frontend_kill": true,
            "data_path": "direct FUSE I/O with generation-keyed daemon content cache",
            "mmap": "private mapping readable; shared mapping returns ENODEV; mappings are not a live view"
        }))?,
    )?;
    Ok(())
}

async fn optimistic_local_writes_reuse_metadata_and_fence_a_cached_conflict() -> anyhow::Result<()>
{
    use dfs_fdb::mount_cache::{Limits, MountCache};
    use std::sync::atomic::Ordering;
    let directory = tempfile::tempdir()?;
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![Credential {
            token_hash: token_hash("admin"),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: "owner".into(),
            principal: "owner".into(),
            admin: true,
            scope: None,
            expires_ms: now_ms() + 3_600_000,
        }])?,
    )?;
    let namespace = format!("optimistic-cache-{}", id());
    let mut first = Frontend::start(directory.path(), "first", &namespace, None)?;
    let reader = first.ready().await?;
    let mut second = Frontend::start(directory.path(), "second", &namespace, None)?;
    let writer = second.ready().await?;
    let root = writer
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|item| item.visible_parent.is_none())
        .unwrap()
        .node;
    let node = writer
        .mutate(Mutation::Create {
            parent: root.id.clone(),
            name: "file".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let cache = MountCache::new(reader.clone(), Limits::default())?;
    let mut file = cache.open_file(&node.id, libc::O_RDWR).await?;
    let original_freshness = file.freshness()?;
    let observed_at = std::time::Instant::now();
    writer
        .mutate(Mutation::Create {
            parent: root.id.clone(),
            name: "unseen".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?;
    let before = reader.counters.calls.load(Ordering::Relaxed);
    cache.write_file(&mut file, 0, b"first".to_vec()).await?;
    cache.write_file(&mut file, 0, b"local".to_vec()).await?;
    assert_eq!(reader.counters.calls.load(Ordering::Relaxed) - before, 2);
    assert_eq!(
        file.freshness()?.remaining_at(observed_at),
        original_freshness.remaining_at(observed_at)
    );
    let validation_calls = reader.counters.calls.load(Ordering::Relaxed);
    let validated = cache.validation().await?;
    if reader.counters.calls.load(Ordering::Relaxed) == validation_calls {
        assert_eq!(
            validated.remaining_at(observed_at),
            original_freshness.remaining_at(observed_at)
        );
    }
    tokio::time::sleep(Duration::from_millis(1020)).await;
    let before = reader.counters.calls.load(Ordering::Relaxed);
    cache.write_file(&mut file, 0, b"local".to_vec()).await?;
    assert_eq!(reader.counters.calls.load(Ordering::Relaxed) - before, 1);
    cache.close_file(file).await?;
    assert_eq!(
        cache.lookup(Some(&root.id), "unseen").await?.item.node.name,
        "unseen"
    );
    let mut file = cache.open_file(&node.id, libc::O_RDWR).await?;
    cache.sync_file(&mut file).await?;
    let before = reader.counters.calls.load(Ordering::Relaxed);
    cache.flush_file(&mut file).await?;
    cache.sync_file(&mut file).await?;
    assert_eq!(reader.counters.calls.load(Ordering::Relaxed), before);
    cache.invalidate().await;
    cache.refresh_file(&mut file).await?;
    writer
        .mutate(Mutation::Write {
            node: node.id,
            base: file.node().version.clone(),
            offset: 0,
            data: b"other".to_vec(),
            append: false,
            handle: None,
        })
        .await?;
    assert!(
        !file
            .freshness()?
            .requires_refresh_at(std::time::Instant::now())
    );
    assert_eq!(
        cache
            .write_file(&mut file, 0, b"stale".to_vec())
            .await
            .unwrap_err()
            .code,
        libc::ESTALE
    );
    assert_eq!(cache.read_file(&mut file, 0, 32).await?.bytes, b"other");
    std::fs::write(
        "results/cache-rework/optimistic-local-writes.json",
        serde_json::to_vec_pretty(
            &serde_json::json!({"passed":true,"writes":2,"write_rpcs":2,"additional_validation_rpcs":0,"expired_revision_write_rpcs":1,"local_overlay_preserves_deadline":true,"unseen_foreign_change_not_skipped":true,"receipt_survives_reopen":true,"repeat_sync_and_flush_rpcs":0,"cached_conflict_rejected_inside_one_second":true,"scope":"two independent frontends and real FoundationDB; daemon cache API"}),
        )?,
    )?;
    Ok(())
}

#[derive(Clone)]
struct LostPublicationReply {
    upstream: DfsClient<tonic::transport::Channel>,
    lose: std::sync::Arc<std::sync::atomic::AtomicBool>,
    requests: std::sync::Arc<std::sync::Mutex<Vec<Vec<u8>>>>,
}

#[tonic::async_trait]
impl dfs_fdb::wire::dfs_server::Dfs for LostPublicationReply {
    async fn call(
        &self,
        request: tonic::Request<dfs_fdb::wire::Frame>,
    ) -> std::result::Result<tonic::Response<dfs_fdb::wire::Frame>, tonic::Status> {
        let envelope: Envelope = decode(request.get_ref().clone())
            .map_err(|error| tonic::Status::invalid_argument(error.to_string()))?;
        let mutation = matches!(envelope.call, Call::Mutate { .. });
        if mutation {
            self.requests
                .lock()
                .unwrap()
                .push(request.get_ref().payload.clone());
        }
        let response = self.upstream.clone().call(request).await?;
        if mutation && self.lose.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(tonic::Status::unavailable("committed reply lost"));
        }
        Ok(response)
    }

    type SnapshotStream = tonic::Streaming<dfs_fdb::wire::Frame>;

    async fn snapshot(
        &self,
        request: tonic::Request<dfs_fdb::wire::Frame>,
    ) -> std::result::Result<tonic::Response<Self::SnapshotStream>, tonic::Status> {
        self.upstream.clone().snapshot(request).await
    }
}

async fn uncertain_append_survives_close_and_replays_once() -> anyhow::Result<()> {
    use dfs_fdb::mount_cache::{Limits, MountCache};
    use std::sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    };
    let directory = tempfile::tempdir()?;
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![Credential {
            token_hash: token_hash("admin"),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: "owner".into(),
            principal: "owner".into(),
            admin: true,
            scope: None,
            expires_ms: now_ms() + 3_600_000,
        }])?,
    )?;
    let mut frontend = Frontend::start(
        directory.path(),
        "publisher",
        &format!("uncertain-cache-{}", id()),
        None,
    )?;
    let writer = frontend.ready().await?;
    let root = writer
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|item| item.visible_parent.is_none())
        .unwrap()
        .node;
    let node = writer
        .mutate(Mutation::Create {
            parent: root.id,
            name: "append".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let proxy = LostPublicationReply {
        upstream: writer.rpc.clone(),
        lose: Arc::new(AtomicBool::new(true)),
        requests: Arc::default(),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}", listener.local_addr()?);
    let (stop, stopping) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(
        tonic::transport::Server::builder()
            .add_service(dfs_fdb::wire::dfs_server::DfsServer::new(proxy.clone()))
            .serve_with_incoming_shutdown(
                tokio_stream::wrappers::TcpListenerStream::new(listener),
                async {
                    let _ = stopping.await;
                },
            ),
    );
    let client = Client::connect(&endpoint, "admin", None).await?;
    let cache = MountCache::new(client, Limits::default())?;
    let mut file = cache
        .open_file(&node.id, libc::O_RDWR | libc::O_APPEND)
        .await?;
    assert_eq!(
        cache
            .write_file(&mut file, 0, b"once".to_vec())
            .await
            .unwrap_err()
            .code,
        libc::ETIMEDOUT
    );
    cache.close_file(file).await?;
    proxy.lose.store(false, Ordering::SeqCst);
    let mut reopened = cache
        .open_file(&node.id, libc::O_RDWR | libc::O_APPEND)
        .await?;
    assert_eq!(
        cache
            .write_file(&mut reopened, 0, b"blocked".to_vec())
            .await
            .unwrap_err()
            .code,
        libc::ETIMEDOUT
    );
    cache.sync_file(&mut reopened).await?;
    assert_eq!(cache.read_file(&mut reopened, 0, 32).await?.bytes, b"once");
    {
        let requests = proxy.requests.lock().unwrap();
        assert_eq!(requests.len(), 4);
        assert!(requests.iter().all(|request| request == &requests[0]));
    }
    cache.write_file(&mut reopened, 0, b"next".to_vec()).await?;
    assert_eq!(
        cache.read_file(&mut reopened, 0, 32).await?.bytes,
        b"oncenext"
    );
    cache.sync_file(&mut reopened).await?;
    cache.close_file(reopened).await?;
    let _ = stop.send(());
    server.await??;
    std::fs::create_dir_all("results/cache-rework")?;
    std::fs::write(
        "results/cache-rework/uncertain-append.json",
        serde_json::to_vec_pretty(&serde_json::json!({
            "passed":true,"scope":"real FoundationDB and frontend process, transport proxy discards all three successful append replies",
            "original_identity_and_payload_replayed_after_close":true,"duplicate_append_prevented":true,
            "conflicting_new_append_blocked_until_resolution":true,"successful_append_after_resolution":true
        }))?,
    )?;
    Ok(())
}

mod support;

fn main() {
    support::main(vec![
        libtest_mimic::Trial::test("content_hash_reuse_and_bounded_batches", || {
            support::run(content_hash_reuse_and_bounded_batches())
        })
        .with_ignored_flag(true),
        libtest_mimic::Trial::test("uncertain_append_survives_close_and_replays_once", || {
            support::run(uncertain_append_survives_close_and_replays_once())
        })
        .with_ignored_flag(true),
        libtest_mimic::Trial::test(
            "optimistic_local_writes_reuse_metadata_and_fence_a_cached_conflict",
            || support::run(optimistic_local_writes_reuse_metadata_and_fence_a_cached_conflict()),
        )
        .with_ignored_flag(true),
        libtest_mimic::Trial::test(
            "processes_share_handles_refresh_on_demand_and_resolve_killed_publisher",
            || {
                support::run(
                    processes_share_handles_refresh_on_demand_and_resolve_killed_publisher(),
                )
            },
        )
        .with_ignored_flag(true),
        libtest_mimic::Trial::test(
            "affinity_tracks_actual_cache_and_fails_over_inflight_publication",
            || support::run(affinity_tracks_actual_cache_and_fails_over_inflight_publication()),
        )
        .with_ignored_flag(true),
        libtest_mimic::Trial::test(
            "indexer_process_recovers_after_bulk_acknowledgement_before_checkpoint",
            || {
                support::run(
                    indexer_process_recovers_after_bulk_acknowledgement_before_checkpoint(),
                )
            },
        )
        .with_ignored_flag(true),
        libtest_mimic::Trial::test(
            "daemon_cache_expires_on_demand_and_keeps_file_generations_coherent",
            || support::run(daemon_cache_expires_on_demand_and_keeps_file_generations_coherent()),
        )
        .with_ignored_flag(true),
        #[cfg(target_os = "linux")]
        libtest_mimic::Trial::test(
            "mounted_metadata_expires_without_stacking_kernel_and_daemon_ttls",
            || support::run(mounted_metadata_expires_without_stacking_kernel_and_daemon_ttls()),
        )
        .with_ignored_flag(true),
        #[cfg(target_os = "linux")]
        libtest_mimic::Trial::test(
            "mounted_files_follow_live_generations_and_fence_competing_writers",
            || support::run(mounted_files_follow_live_generations_and_fence_competing_writers()),
        )
        .with_ignored_flag(true),
        #[cfg(target_os = "linux")]
        libtest_mimic::Trial::test(
            "mounted_live_authority_expires_even_when_path_metadata_remains_visible",
            || {
                support::run(
                    mounted_live_authority_expires_even_when_path_metadata_remains_visible(),
                )
            },
        )
        .with_ignored_flag(true),
        #[cfg(target_os = "linux")]
        libtest_mimic::Trial::test("delayed_read_is_revalidated_after_remote_truncate", || {
            support::run(delayed_read_is_revalidated_after_remote_truncate())
        })
        .with_ignored_flag(true),
        libtest_mimic::Trial::test(
            "live_cache_shares_validation_and_uses_local_read_handles",
            || support::run(live_cache_shares_validation_and_uses_local_read_handles()),
        )
        .with_ignored_flag(true),
        #[cfg(target_os = "linux")]
        libtest_mimic::Trial::test(
            "mounted_live_descriptors_refresh_contents_and_preserve_identity",
            || support::run(mounted_live_descriptors_refresh_contents_and_preserve_identity()),
        )
        .with_ignored_flag(true),
    ]);
}

async fn content_hash_reuse_and_bounded_batches() -> anyhow::Result<()> {
    use dfs_fdb::mount_cache::{Limits as CacheLimits, MountCache};
    let directory = tempfile::tempdir()?;
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&vec![Credential {
            token_hash: token_hash("admin"),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: "owner".into(),
            principal: "owner".into(),
            admin: true,
            scope: None,
            expires_ms: now_ms() + 3_600_000,
        }])?,
    )?;
    let mut server = Frontend::start(
        directory.path(),
        "blocks",
        &format!("blocks-{}", id()),
        None,
    )?;
    let client = server.ready().await?;

    let root = client.view().await?.nodes[0].node.id.clone();
    let mut node = client
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "hash-reuse".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await?
        .node
        .unwrap();
    let mut body = [
        vec![b'a'; CHUNK_BYTES],
        vec![b'b'; CHUNK_BYTES],
        vec![b'c'; CHUNK_BYTES],
    ]
    .concat();
    node = client
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: body.clone(),
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    let cache = MountCache::new(client.clone(), CacheLimits::default())?;
    let mut handle = cache.open_file(&node.id, libc::O_RDONLY).await?;
    assert_eq!(
        cache
            .read_file(&mut handle, 0, body.len() as u32)
            .await?
            .bytes,
        body
    );
    let payload = || {
        client
            .counters
            .block_chunk_bytes
            .load(std::sync::atomic::Ordering::Relaxed)
    };
    let before = payload();
    node = client
        .mutate(Mutation::SetAttr {
            node: node.id.clone(),
            base: node.version,
            mode: Some(0o640),
            mtime_ms: None,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    cache.invalidate().await;
    assert_eq!(
        cache
            .read_file(&mut handle, 0, body.len() as u32)
            .await?
            .bytes,
        body
    );
    assert_eq!(payload(), before);
    node = client
        .mutate(Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: CHUNK_BYTES as u64,
            data: vec![b'd'; CHUNK_BYTES],
            append: false,
            handle: None,
        })
        .await?
        .node
        .unwrap();
    body[CHUNK_BYTES..2 * CHUNK_BYTES].fill(b'd');
    cache.invalidate().await;
    assert_eq!(
        cache
            .read_file(&mut handle, 0, body.len() as u32)
            .await?
            .bytes,
        body
    );
    assert_eq!(payload() - before, CHUNK_BYTES as u64);
    let range = BlockRead {
        node: node.id.clone(),
        version: node.version.clone(),
        offset: 0,
        size: 1,
        handle: None,
        known: vec![],
    };
    let mut absent = range.clone();
    absent.node = "absent".into();
    let Reply::Blocks(pages) = client
        .call(Call::ReadBlocks {
            ranges: vec![range.clone(), absent],
        })
        .await?
    else {
        panic!("block reply");
    };
    assert!(pages[0].is_ok());
    assert!(pages[1].is_err());
    assert_eq!(
        client
            .call(Call::ReadBlocks {
                ranges: vec![range.clone(); MAX_BLOCK_REQUESTS + 1]
            })
            .await
            .unwrap_err()
            .code,
        libc::E2BIG
    );
    let cold = MountCache::new(
        client.clone(),
        CacheLimits {
            concurrent_reads: 16,
            ..CacheLimits::default()
        },
    )?;
    let observation = cold.lookup(Some(&root), "hash-reuse").await?;
    let before = client
        .counters
        .block_batches
        .load(std::sync::atomic::Ordering::Relaxed);
    let reads = futures::future::join_all((0..16).map(|_| cold.read(&observation, 0, 1))).await;
    for read in reads {
        assert_eq!(read?.bytes, b"a");
    }
    assert!(
        client
            .counters
            .block_batches
            .load(std::sync::atomic::Ordering::Relaxed)
            - before
            < 16
    );
    let empty = MountCache::new(
        client.clone(),
        CacheLimits {
            content_bytes: 0,
            ..CacheLimits::default()
        },
    )?;
    let observation = empty.lookup(Some(&root), "hash-reuse").await?;
    assert_eq!(
        empty.read(&observation, 0, body.len() as u32).await?.bytes,
        body
    );
    assert_eq!(empty.content_stats().resident_bytes, 0);
    cache.close_file(handle).await?;
    Ok(())
}
