mod support;
use dfs_tikv::{
    Config, Store,
    engine::{Engine, Limits, token_hash},
    model::*,
    search::{Authority, Indexer, Request, Search},
};
use serde_json::{Value, json};
use std::{sync::Arc, time::Instant};

async fn publish(
    engine: &Engine,
    session: &Session,
    mutation: Mutation,
) -> anyhow::Result<Outcome> {
    Ok(engine
        .mutate(&session.id, session.request_id(), mutation)
        .await?)
}

async fn create(
    engine: &Engine,
    session: &Session,
    parent: &str,
    name: &str,
) -> anyhow::Result<Node> {
    Ok(publish(
        engine,
        session,
        Mutation::Create {
            parent: parent.into(),
            name: name.into(),
            kind: Kind::File,
            mode: 0o644,
        },
    )
    .await?
    .node
    .unwrap())
}

async fn write(
    engine: &Engine,
    session: &Session,
    node: &Node,
    data: &[u8],
) -> anyhow::Result<Node> {
    Ok(publish(
        engine,
        session,
        Mutation::Write {
            node: node.id.clone(),
            base: node.version.clone(),
            offset: 0,
            data: data.to_vec(),
            append: false,
            handle: None,
        },
    )
    .await?
    .node
    .unwrap())
}

async fn document(endpoint: &str, index: &str, node: &str) -> anyhow::Result<Value> {
    Ok(reqwest::get(format!("{endpoint}/{index}/_doc/{node}"))
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?["_source"]
        .clone())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV and Elasticsearch in dust-dev"]
async fn distributed_incremental_workers_reject_stale_replay_and_recover_shared_progress()
-> anyhow::Result<()> {
    let pd = std::env::var("DFS_TIKV_TEST_PD")?;
    let es: Vec<String> = std::env::var("DFS_TIKV_TEST_ES")?
        .split(',')
        .map(str::to_owned)
        .collect();
    let config = support::config(Config::new(
        pd.split(',').map(str::to_owned).collect(),
        format!("index-{}", id()),
    ));
    let credentials: Vec<_> = [("admin", true), ("reader", false)]
        .into_iter()
        .map(|(token, admin)| Credential {
            token_hash: token_hash(token),
            tenant: "tenant".into(),
            issuer: "test".into(),
            subject: token.into(),
            principal: token.into(),
            admin,
            scope: None,
            expires_ms: now_ms() + 3_600_000,
        })
        .collect();
    let first = Arc::new(
        Engine::open(
            Store::connect(config.clone()).await?,
            credentials.clone(),
            Limits::default(),
        )
        .await?,
    );
    let second = Arc::new(
        Engine::open(
            Store::connect(config).await?,
            credentials,
            Limits::default(),
        )
        .await?,
    );
    let session = first.login("admin").await?;
    let reader = first.login("reader").await?;
    let root = first.root(&session.id).await?;
    let one = create(&first, &session, &root, "one.txt").await?;
    let one = write(&first, &session, &one, b"alpha before").await?;
    let two = create(&second, &session, &root, "two.txt").await?;
    let two = write(&second, &session, &two, b"beta steady").await?;
    let mut failed_endpoint = vec!["http://127.0.0.1:1".into()];
    failed_endpoint.extend(es.clone());
    let worker_a = Indexer::new(first.clone(), failed_endpoint)?;
    let worker_b = Indexer::new(second.clone(), es.clone())?;
    assert!(worker_a.prepare(&reader.id).await.is_err());
    let (a, b) = tokio::join!(worker_a.prepare(&session.id), worker_b.prepare(&session.id));
    let (a, b) = tokio::join!(worker_a.apply(a?), worker_b.apply(b?));
    let a = a?;
    let b = b?;
    assert_ne!(a.advanced, b.advanced);
    assert_eq!(a.through, 4);
    assert_eq!(a.documents, 3);
    assert_eq!(
        document(&es[0], &a.index, &one.id).await?["text"],
        "alpha before"
    );
    assert_eq!(worker_b.sync_once(&session.id).await?.documents, 0);
    let one = write(&first, &session, &one, b"alpha newer!").await?;
    let stale = worker_a.prepare(&session.id).await?;
    let one = write(&second, &session, &one, b"alpha newest").await?;
    let changed = worker_b.sync_once(&session.id).await?;
    assert_eq!(changed.documents, 1);
    assert_eq!(changed.through, 6);
    let replay = worker_a.apply(stale).await?;
    assert!(!replay.advanced);
    assert_eq!(
        document(&es[0], &a.index, &one.id).await?["text"],
        "alpha newest"
    );
    assert_eq!(document(&es[0], &a.index, &two.id).await?["source_head"], 4);
    let one = write(&first, &session, &one, b"late replay!").await?;
    let stale_before_delete = worker_a.prepare(&session.id).await?;
    publish(
        &second,
        &session,
        Mutation::Unlink {
            parent: root.clone(),
            name: "one.txt".into(),
            expected: one.entry_token,
            directory: false,
        },
    )
    .await?;
    let deleted = worker_b.sync_once(&session.id).await?;
    assert_eq!(deleted.documents, 1);
    assert_eq!(deleted.through, 8);
    worker_a.apply(stale_before_delete).await?;
    let tombstone = document(&es[0], &a.index, &one.id).await?;
    assert_eq!(tombstone["deleted"], true);
    assert!(tombstone["text"].is_null());
    let recovered = Indexer::new(first.clone(), es.clone())?
        .sync_once(&session.id)
        .await?;
    assert_eq!(recovered.documents, 0);
    assert_eq!(recovered.through, 8);
    publish(
        &first,
        &session,
        Mutation::Grant {
            node: root.clone(),
            subject: "reader".into(),
            verbs: READ | LIST | TRAVERSE,
        },
    )
    .await?;
    let policy = worker_b.sync_once(&session.id).await?;
    assert_eq!(policy.documents, 0);
    assert_eq!(policy.through, 9);
    assert_eq!(
        second
            .validate_search(&reader.id, std::slice::from_ref(&two.id))
            .await?
            .nodes
            .len(),
        1
    );
    publish(
        &first,
        &session,
        Mutation::Grant {
            node: root,
            subject: "reader".into(),
            verbs: 0,
        },
    )
    .await?;
    assert!(
        second
            .validate_search(&reader.id, std::slice::from_ref(&two.id))
            .await?
            .nodes
            .is_empty()
    );
    assert_eq!(
        document(&es[0], &a.index, &two.id).await?["text"],
        "beta steady"
    );
    reqwest::Client::new()
        .delete(format!("{}/{}", es[0], a.index))
        .send()
        .await?
        .error_for_status()?;
    let rebuilt = worker_a.sync_once(&session.id).await?;
    assert_eq!(rebuilt.documents, 3);
    assert_eq!(rebuilt.through, 10);
    assert_eq!(
        document(&es[0], &a.index, &two.id).await?["text"],
        "beta steady"
    );
    assert_eq!(document(&es[0], &a.index, &one.id).await?["deleted"], true);
    std::fs::create_dir_all("results")?;
    std::fs::write(
        support::artifact("results/incremental-index.json"),
        serde_json::to_vec_pretty(&json!({
            "passed":true,"workers":2,"shared_checkpoint":true,"initial_documents":3,
            "edited_documents":changed.documents,"unchanged_document_source_head":4,
            "stale_replay_rejected":true,"persistent_delete_tombstone":true,
            "policy_change_documents":policy.documents,"index_uuid_recovery":true,
            "failed_endpoint_bypassed":true,
            "revocation_checked_before_index_catches_up":true,
            "limitation":"independent engine clients in one test process; process and VM indexer failures still require deployment tests"
        }))?,
    )?;
    reqwest::Client::new()
        .delete(format!("{}/{}", es[0], a.index))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

struct Fixture {
    first: Arc<Engine>,
    second: Arc<Engine>,
    session: Session,
    root: String,
    es: Vec<String>,
}

impl Fixture {
    async fn new(prefix: &str) -> anyhow::Result<Self> {
        let pd = std::env::var("DFS_TIKV_TEST_PD")?;
        let es = std::env::var("DFS_TIKV_TEST_ES")?
            .split(',')
            .map(str::to_owned)
            .collect();
        let config = support::config(Config::new(
            pd.split(',').map(str::to_owned).collect(),
            format!("{prefix}-{}", id()),
        ));
        let credentials: Vec<_> = [("admin", true), ("reader", false)]
            .into_iter()
            .map(|(token, admin)| Credential {
                token_hash: token_hash(token),
                tenant: "tenant".into(),
                issuer: "test".into(),
                subject: token.into(),
                principal: token.into(),
                admin,
                scope: None,
                expires_ms: now_ms() + 3_600_000,
            })
            .collect();
        let first = Arc::new(
            Engine::open(
                Store::connect(config.clone()).await?,
                credentials.clone(),
                Limits::default(),
            )
            .await?,
        );
        let second = Arc::new(
            Engine::open(
                Store::connect(config).await?,
                credentials,
                Limits::default(),
            )
            .await?,
        );
        let session = first.login("admin").await?;
        let root = first.root(&session.id).await?;
        Ok(Self {
            first,
            second,
            session,
            root,
            es,
        })
    }

    async fn directory(&self, parent: &str, name: &str) -> anyhow::Result<Node> {
        Ok(publish(
            &self.first,
            &self.session,
            Mutation::Create {
                parent: parent.into(),
                name: name.into(),
                kind: Kind::Directory,
                mode: 0o755,
            },
        )
        .await?
        .node
        .unwrap())
    }

    async fn delete_index(&self, index: &str) -> anyhow::Result<()> {
        reqwest::Client::new()
            .delete(format!("{}/{index}", self.es[0]))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}

fn node_request(node: &Node) -> anyhow::Result<Request> {
    Ok(serde_json::from_value(json!({
        "query":{"type":"node","id":node.id},"include_text":true
    }))?)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV and Elasticsearch in dust-dev"]
async fn directory_move_during_index_publication_preserves_authority_and_newer_content()
-> anyhow::Result<()> {
    let f = Fixture::new("index-move").await?;
    let shared = f.directory(&f.root, "shared").await?;
    let private = f.directory(&f.root, "private").await?;
    let nested = f.directory(&shared.id, "nested").await?;
    let file = create(&f.first, &f.session, &nested.id, "report.txt").await?;
    let file = write(&f.first, &f.session, &file, b"revision 000").await?;
    let sentinel = create(&f.first, &f.session, &nested.id, "steady.txt").await?;
    publish(
        &f.first,
        &f.session,
        Mutation::Grant {
            node: shared.id.clone(),
            subject: "reader".into(),
            verbs: READ | LIST | TRAVERSE,
        },
    )
    .await?;
    let worker_a = Indexer::new(f.first.clone(), f.es.clone())?;
    let worker_b = Indexer::new(f.second.clone(), f.es.clone())?;
    let initial = worker_a.sync_once(&f.session.id).await?;
    assert_eq!(initial.through, initial.source_head);
    let sentinel_before = document(&f.es[0], &initial.index, &sentinel.id).await?;
    let search = Search::new(f.second.clone(), f.es.clone())?;
    let request = node_request(&file)?;
    assert_eq!(
        search
            .query(Authority::Token("reader"), "tenant", "documents", &request)
            .await?
            .rows[0]["text"],
        "revision 000"
    );
    let file = write(&f.first, &f.session, &file, b"revision 001").await?;
    let in_flight = worker_a.prepare(&f.session.id).await?;
    let moved = publish(
        &f.second,
        &f.session,
        Mutation::Rename {
            parent: shared.id,
            name: nested.name,
            expected: nested.entry_token,
            new_parent: private.id,
            new_name: "moved".into(),
            destination: None,
        },
    )
    .await?
    .node
    .unwrap();
    let denied_before = search
        .query(Authority::Token("reader"), "tenant", "documents", &request)
        .await?;
    assert!(denied_before.rows.is_empty());
    assert_eq!(denied_before.dfs["incomplete"], true);
    let moved_progress = worker_b.sync_once(&f.session.id).await?;
    assert_eq!(moved_progress.documents, 2);
    assert_eq!(moved_progress.through, moved_progress.source_head);
    assert_eq!(
        document(&f.es[0], &initial.index, &moved.id).await?["basename"],
        "moved"
    );
    let file = write(&f.second, &f.session, &file, b"revision 002").await?;
    assert_eq!(worker_b.sync_once(&f.session.id).await?.documents, 1);
    let late = worker_a.apply(in_flight).await?;
    assert!(!late.advanced);
    let final_document = document(&f.es[0], &initial.index, &file.id).await?;
    assert_eq!(final_document["text"], "revision 002");
    assert_eq!(final_document["source_version"], file.version);
    assert_eq!(
        document(&f.es[0], &initial.index, &sentinel.id).await?,
        sentinel_before
    );
    let denied_after = search
        .query(Authority::Token("reader"), "tenant", "documents", &request)
        .await?;
    assert!(denied_after.rows.is_empty());
    assert_eq!(denied_after.dfs["incomplete"], false);
    let authorized = search
        .query(Authority::Token("admin"), "tenant", "documents", &request)
        .await?;
    assert_eq!(authorized.rows[0]["text"], "revision 002");
    assert_eq!(authorized.dfs["incomplete"], false);
    std::fs::write(
        support::artifact("results/index-move-race.json"),
        serde_json::to_vec_pretty(&json!({
            "passed":true,"workers":2,"move_and_pending_edit_documents":moved_progress.documents,
            "late_plan_advanced_checkpoint":late.advanced,"late_plan_documents":late.documents,
            "reader_denied_before_index_catchup":true,"reader_denied_after_late_publication":true,
            "newest_content_preserved":true,"untouched_descendant_document_unchanged":true,
            "schedule":"prepare A; move via B; index B; write newer via B; index B; apply old A",
            "scope":"two independent engine clients and caches in one GCP process; three-host storage"
        }))?,
    )?;
    f.delete_index(&initial.index).await?;
    Ok(())
}

async fn refresh_interval(endpoint: &str, index: &str, value: &str) -> anyhow::Result<()> {
    let response = reqwest::Client::new()
        .put(format!("{endpoint}/{index}/_settings"))
        .json(&json!({"index":{"refresh_interval":value}}))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    assert_eq!(response["acknowledged"], true);
    Ok(())
}

async fn index_operations(endpoint: &str, index: &str) -> anyhow::Result<u64> {
    let stats = reqwest::get(format!("{endpoint}/{index}/_stats/indexing"))
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    assert_eq!(stats["_shards"]["failed"], 0);
    stats["_all"]["primaries"]["indexing"]["index_total"]
        .as_u64()
        .ok_or_else(|| anyhow::anyhow!("primary indexing counter absent"))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "requires real TiKV and Elasticsearch in dust-dev; creates 10000 files"]
async fn large_tenant_edits_index_one_document_and_become_search_visible() -> anyhow::Result<()> {
    const FILES: usize = 10_000;
    let f = Fixture::new("index-large").await?;
    let worker = Indexer::new(f.second.clone(), f.es.clone())?;
    let initial = worker.sync_once(&f.session.id).await?;
    refresh_interval(&f.es[0], &initial.index, "100ms").await?;
    let started = Instant::now();
    let mut nodes = Vec::new();
    for i in 0..FILES {
        let node = create(&f.first, &f.session, &f.root, &format!("file-{i:05}.txt")).await?;
        if i < 2 {
            nodes.push(node);
        }
        if (i + 1) % 500 == 0 {
            eprintln!(
                "large tenant: created {} files in {:.1}s",
                i + 1,
                started.elapsed().as_secs_f64()
            );
        }
    }
    let mut target = write(&f.first, &f.session, &nodes[0], b"revision 000").await?;
    let creation_ms = started.elapsed().as_secs_f64() * 1000.0;
    let bootstrap = Instant::now();
    let mut bootstrap_passes = 0;
    loop {
        let progress = worker.sync_once(&f.session.id).await?;
        bootstrap_passes += 1;
        if bootstrap_passes % 50 == 0 {
            eprintln!(
                "large tenant: indexed through {}/{} in {:.1}s",
                progress.through,
                progress.source_head,
                bootstrap.elapsed().as_secs_f64()
            );
        }
        if progress.through == progress.source_head {
            break;
        }
        anyhow::ensure!(bootstrap_passes <= FILES, "bootstrap failed to advance");
    }
    let bootstrap_ms = bootstrap.elapsed().as_secs_f64() * 1000.0;
    refresh_interval(&f.es[0], &initial.index, "1s").await?;
    let count = reqwest::get(format!("{}/{}/_count", f.es[0], initial.index))
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    assert_eq!(count["count"], FILES + 1);
    let sentinel_before = document(&f.es[0], &initial.index, &nodes[1].id).await?;
    let search = Search::new(f.first.clone(), f.es.clone())?;
    let request = node_request(&target)?;
    let mut edits = Vec::new();
    for revision in 1..=5 {
        let primary_before = index_operations(&f.es[0], &initial.index).await?;
        let text = format!("revision {revision:03}");
        let mutation_started = Instant::now();
        target = write(&f.first, &f.session, &target, text.as_bytes()).await?;
        let mutation_ms = mutation_started.elapsed().as_secs_f64() * 1000.0;
        let acknowledged = Instant::now();
        let before = f.second.store.stats();
        let progress = worker.sync_once(&f.session.id).await?;
        let after = f.second.store.stats();
        let index_ms = acknowledged.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(progress.documents, 1);
        assert_eq!(progress.through, progress.source_head);
        let visible = search
            .query(Authority::Token("admin"), "tenant", "documents", &request)
            .await?;
        let visible_ms = acknowledged.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(visible.dfs["incomplete"], false);
        assert_eq!(visible.rows.len(), 1);
        assert_eq!(visible.rows[0]["text"], text);
        assert_eq!(visible.rows[0]["source_version"], target.version);
        let primary_after = index_operations(&f.es[0], &initial.index).await?;
        assert_eq!(primary_after - primary_before, 1);
        assert_eq!(
            document(&f.es[0], &initial.index, &nodes[1].id).await?,
            sentinel_before
        );
        let measurement = json!({
            "revision":revision,"mutation_ms":mutation_ms,"ack_to_index_ms":index_ms,
            "ack_to_verified_search_ms":visible_ms,"indexed_documents":progress.documents,
            "primary_index_operations":primary_after-primary_before,
            "indexer_object_reads":after.object_reads-before.object_reads,
            "indexer_object_writes":after.object_writes-before.object_writes,
            "indexer_root_reads":after.root_reads-before.root_reads,
            "indexer_root_cas":after.root_cas-before.root_cas,
            "indexer_stats_before":before,"indexer_stats_after":after,
            "through":progress.through
        });
        eprintln!("large tenant edit: {measurement}");
        edits.push(measurement);
    }
    std::fs::write(
        support::artifact("results/large-tenant-index.json"),
        serde_json::to_vec_pretty(&json!({
            "passed":true,"files":FILES,"indexed_records":FILES+1,"creation_ms":creation_ms,
            "bootstrap_ms":bootstrap_ms,"bootstrap_passes":bootstrap_passes,
            "bootstrap_refresh_interval":"100ms","measurement_refresh_interval":"1s",
            "shards":3,"replicas":1,"edits":edits,
            "unchanged_sentinel_preserved":true,
            "workload":"10000 empty files; one receives 12-byte text and five same-size edits",
            "scope":"normal filesystem publications; direct index driver without worker polling delay; two independent engines on host A; three-host storage",
            "limitations":"namespace cardinality and incremental work, not large-body ingest, HTTP ingress latency, or production visibility SLA"
        }))?,
    )?;
    f.delete_index(&initial.index).await?;
    Ok(())
}
