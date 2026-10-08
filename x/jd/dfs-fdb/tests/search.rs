use dfs_fdb::{
    Config, Store,
    engine::{Engine, Limits, token_hash},
    model::*,
    search::{Authority, Indexer, Request, Search, http},
};
use serde_json::{Value, json};
use std::sync::Arc;

async fn mutation(
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
    kind: Kind,
) -> anyhow::Result<Node> {
    Ok(mutation(
        engine,
        session,
        Mutation::Create {
            parent: parent.into(),
            name: name.into(),
            kind,
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
    text: &str,
) -> anyhow::Result<Node> {
    Ok(mutation(
        engine,
        session,
        Mutation::Write {
            node: node.id.clone(),
            base: node.version.clone(),
            offset: 0,
            data: text.as_bytes().to_vec(),
            append: false,
            handle: None,
        },
    )
    .await?
    .node
    .unwrap())
}

async fn grant(engine: &Engine, session: &Session, node: &str, verbs: u16) -> anyhow::Result<()> {
    mutation(
        engine,
        session,
        Mutation::Grant {
            node: node.into(),
            subject: "reader".into(),
            verbs,
        },
    )
    .await?;
    Ok(())
}

async fn catch_up(indexer: &Indexer, session: &Session) -> anyhow::Result<()> {
    for _ in 0..100 {
        let progress = indexer.sync_once(&session.id).await?;
        if progress.through == progress.source_head {
            return Ok(());
        }
    }
    anyhow::bail!("index did not catch up")
}

fn request(value: Value) -> anyhow::Result<Request> {
    Ok(serde_json::from_value(value)?)
}

async fn stateless_search_filters_before_pagination_and_checks_current_authority()
-> anyhow::Result<()> {
    dfs_fdb::rpc::initialize_crypto();
    let pd = std::env::var("DFS_FDB_TEST_CLUSTER_FILE")?;
    let es: Vec<String> = std::env::var("DFS_FDB_TEST_ES")?
        .split(',')
        .map(str::to_owned)
        .collect();
    let config = Config::new(pd.clone(), format!("search-{}", id()));
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
            Store::connect(config.clone()).await?,
            credentials.clone(),
            Limits::default(),
        )
        .await?,
    );
    let admin = first.login("admin").await?;
    let reader = first.login("reader").await?;
    let root = first.root(&admin.id).await?;
    let mut files = Vec::new();
    for i in 0..110 {
        files.push(
            create(
                &first,
                &admin,
                &root,
                &format!("file-{i:03}.txt"),
                Kind::File,
            )
            .await?,
        );
    }
    files.sort_by(|a, b| a.id.cmp(&b.id));
    for file in &mut files[106..] {
        *file = write(&first, &admin, file, "Alpha bravo secret\nSecond line").await?;
        grant(&first, &admin, &file.id, READ).await?;
    }
    let indexer = Indexer::new(first.clone(), es.clone())?;
    catch_up(&indexer, &admin).await?;
    let search_a = Arc::new(Search::new(first.clone(), es.clone())?);
    let search_b = Arc::new(Search::new(second.clone(), es.clone())?);
    let commits = (
        first.store.stats().transaction_commits,
        second.store.stats().transaction_commits,
    );
    let query = request(json!({"query":{"type":"all"},"kind":"file","offset":1,"k":2}))?;
    let result = search_b
        .query(Authority::Token("reader"), "tenant", "nodes", &query)
        .await?;
    assert_eq!(result.rows.len(), 2);
    assert_eq!(result.rows[0]["node_id"], files[107].id);
    assert_eq!(result.rows[1]["node_id"], files[108].id);
    assert_eq!(result.dfs["incomplete"], false);
    assert_eq!(
        (
            first.store.stats().transaction_commits,
            second.store.stats().transaction_commits
        ),
        commits
    );
    for query in [
        json!({"type":"match","terms":"ALPHA bravo"}),
        json!({"type":"phrase","terms":"bravo secret"}),
        json!({"type":"substring","value":"secret\nSecond"}),
    ] {
        let result = search_a
            .query(
                Authority::Session(&reader.id),
                "tenant",
                "documents",
                &request(json!({"query":query,"include_text":true}))?,
            )
            .await?;
        assert_eq!(result.rows.len(), 4);
        assert_eq!(result.dfs["incomplete"], false);
        assert_eq!(result.rows[0]["text"], "Alpha bravo secret\nSecond line");
    }
    let one_query =
        request(json!({"query":{"type":"node","id":files[109].id},"include_text":true}))?;
    files[109] = write(
        &second,
        &admin,
        &files[109],
        "Changed content completely new!",
    )
    .await?;
    let stale = search_b
        .query(
            Authority::Token("reader"),
            "tenant",
            "documents",
            &one_query,
        )
        .await?;
    assert!(stale.rows.is_empty());
    assert_eq!(stale.dfs["incomplete"], true);
    catch_up(&indexer, &admin).await?;
    let refreshed = search_a
        .query(
            Authority::Token("reader"),
            "tenant",
            "documents",
            &one_query,
        )
        .await?;
    assert_eq!(refreshed.rows[0]["source_version"], files[109].version);
    grant(&first, &admin, &files[109].id, WRITE).await?;
    assert!(
        search_b
            .query(
                Authority::Token("reader"),
                "tenant",
                "documents",
                &one_query
            )
            .await?
            .rows
            .is_empty()
    );
    let node_query = request(json!({"query":{"type":"node","id":files[109].id}}))?;
    assert_eq!(
        search_b
            .query(Authority::Token("reader"), "tenant", "nodes", &node_query)
            .await?
            .rows
            .len(),
        1
    );
    grant(&first, &admin, &files[109].id, 0).await?;
    assert!(
        search_b
            .query(Authority::Token("reader"), "tenant", "nodes", &node_query)
            .await?
            .rows
            .is_empty()
    );
    let left = create(&first, &admin, &root, "left", Kind::Directory).await?;
    let right = create(&first, &admin, &root, "right", Kind::Directory).await?;
    let nested = create(&first, &admin, &left.id, "nested", Kind::Directory).await?;
    let child = create(&first, &admin, &nested.id, "child.txt", Kind::File).await?;
    let child = write(&first, &admin, &child, "inherited secret").await?;
    grant(&first, &admin, &left.id, READ | LIST | TRAVERSE).await?;
    catch_up(&indexer, &admin).await?;
    let child_query = request(json!({"query":{"type":"node","id":child.id},"include_text":true}))?;
    assert_eq!(
        search_b
            .query(
                Authority::Token("reader"),
                "tenant",
                "documents",
                &child_query
            )
            .await?
            .rows
            .len(),
        1
    );
    mutation(
        &second,
        &admin,
        Mutation::Rename {
            parent: left.id,
            name: nested.name,
            expected: nested.entry_token,
            new_parent: right.id,
            new_name: "nested".into(),
            destination: None,
        },
    )
    .await?;
    assert!(
        search_a
            .query(
                Authority::Token("reader"),
                "tenant",
                "documents",
                &child_query
            )
            .await?
            .rows
            .is_empty()
    );
    second.logout(&reader.id).await?;
    assert!(
        search_a
            .query(Authority::Session(&reader.id), "tenant", "nodes", &query)
            .await
            .is_err()
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}", listener.local_addr()?);
    let server = tokio::spawn(axum::serve(listener, http::router(search_b.clone())).into_future());
    let client = reqwest::Client::new();
    let url = format!("{endpoint}/v1/workspaces/tenant/lexical/documents/query");
    let payload = json!({"query":{"type":"node","id":files[106].id},"include_text":true});
    let commits = (
        first.store.stats().transaction_commits,
        second.store.stats().transaction_commits,
    );
    for _ in 0..5 {
        let response = client
            .post(&url)
            .bearer_auth("reader")
            .json(&payload)
            .send()
            .await?
            .error_for_status()?
            .json::<Value>()
            .await?;
        assert_eq!(
            response["rows"][0]["text"],
            "Alpha bravo secret\nSecond line"
        );
    }
    assert_eq!(
        (
            first.store.stats().transaction_commits,
            second.store.stats().transaction_commits
        ),
        commits
    );
    assert_eq!(client.post(&url).json(&payload).send().await?.status(), 401);
    assert_eq!(
        client
            .post(&url)
            .bearer_auth("invalid")
            .json(&payload)
            .send()
            .await?
            .status(),
        401
    );
    assert_eq!(
        client
            .post(&url)
            .bearer_auth("reader")
            .json(&json!({"query":{"type":"all"},"k":101}))
            .send()
            .await?
            .status(),
        400
    );
    assert_eq!(
        client
            .post(url.replace("/tenant/", "/elsewhere/"))
            .bearer_auth("reader")
            .json(&payload)
            .send()
            .await?
            .status(),
        404
    );
    assert_eq!(
        client
            .get(format!("{endpoint}/lexical/openapi.json"))
            .send()
            .await?
            .error_for_status()?
            .json::<Value>()
            .await?["openapi"],
        "3.1.0"
    );
    server.abort();
    let directory = tempfile::tempdir()?;
    std::fs::write(
        directory.path().join("credentials.json"),
        serde_json::to_vec(&credentials)?,
    )?;
    std::fs::write(directory.path().join("admin.token"), "admin")?;
    let mut process_a = SearchProcess::start(directory.path(), &pd, &config.namespace, &es)?;
    let mut process_b = SearchProcess::start(directory.path(), &pd, &config.namespace, &es)?;
    process_a.ready(&client).await?;
    process_b.ready(&client).await?;
    assert_eq!(
        process_a.query(&client, &payload).await?["rows"][0]["text"],
        "Alpha bravo secret\nSecond line"
    );
    process_a.child.kill()?;
    process_a.child.wait()?;
    assert_eq!(
        process_b.query(&client, &payload).await?["rows"][0]["text"],
        "Alpha bravo secret\nSecond line"
    );
    grant(&first, &admin, &files[106].id, 0).await?;
    assert!(
        process_b.query(&client, &payload).await?["rows"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let mut replacement = SearchProcess::start(directory.path(), &pd, &config.namespace, &es)?;
    replacement.ready(&client).await?;
    assert!(
        replacement.query(&client, &payload).await?["rows"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    drop(replacement);
    drop(process_b);
    drop(process_a);
    let literal = create(&first, &admin, &root, "literal*?\\é.txt", Kind::File).await?;
    let text = format!(
        "{}\nExact*?\\étéSuffix\n",
        "long searchable content ".repeat(3000)
    );
    let literal = write(&first, &admin, &literal, &text).await?;
    let decoy = create(&first, &admin, &root, "literal-decoy.txt", Kind::File).await?;
    write(&first, &admin, &decoy, "ExactXXétéSuffix").await?;
    catch_up(&indexer, &admin).await?;
    for (table, value) in [("nodes", "*?\\é"), ("documents", "*?\\été")] {
        let query = request(json!({"query":{"type":"substring","value":value},"k":10}))?;
        let result = search_a
            .query(Authority::Token("admin"), "tenant", table, &query)
            .await?;
        assert_eq!(result.dfs["incomplete"], false);
        assert_eq!(result.rows.len(), 1);
        assert_eq!(result.rows[0]["node_id"], literal.id);
    }
    let index = dfs_fdb::search::index_name(&first.incarnation, "tenant")?;
    client
        .delete(format!("{}/{}", es[0], index))
        .send()
        .await?
        .error_for_status()?;
    assert!(
        search_b
            .query(Authority::Token("reader"), "tenant", "nodes", &query)
            .await
            .is_err()
    );
    std::fs::create_dir_all("results")?;
    std::fs::write(
        "results/search-authority.json",
        serde_json::to_vec_pretty(&json!({
            "passed":true,"engines":2,"metadata_candidates":110,"hidden_before_visible":106,
            "pagination_counts_authorized_matches":true,"read_only_token_queries_no_root_publications":true,
            "stale_content_suppressed":true,"read_revocation_before_reindex":true,
            "directory_move_rechecks_inherited_authority":true,"logged_out_session_rejected":true,
            "match_phrase_literal_substring":true,"http_validation_and_authorization":true,
            "missing_index_is_error":true,"http_frontend_process_killed":true,"fresh_frontend_serves_current_authority":true,
        "scope":"independent engines, two HTTP frontend processes and replacement against real FoundationDB and ES; client selects alternate HTTP endpoint; managed HTTP ingress not tested"
        }))?,
    )?;
    Ok(())
}

struct SearchProcess {
    child: std::process::Child,
    endpoint: String,
}

impl SearchProcess {
    fn start(
        directory: &std::path::Path,
        pd: &str,
        namespace: &str,
        es: &[String],
    ) -> anyhow::Result<Self> {
        let rpc = std::net::TcpListener::bind("127.0.0.1:0")?;
        let http = std::net::TcpListener::bind("127.0.0.1:0")?;
        let rpc_address = rpc.local_addr()?;
        let http_address = http.local_addr()?;
        drop(rpc);
        drop(http);
        let log = std::fs::File::create(directory.join(format!("frontend-{http_address}.log")))?;
        let child = std::process::Command::new(
            std::env::var("DFS_FDB_TEST_SERVER")
                .unwrap_or_else(|_| env!("CARGO_BIN_EXE_dfsd-fdb").to_owned()),
        )
        .args([
            "--cluster-file",
            pd,
            "--namespace",
            namespace,
            "--listen",
            &rpc_address.to_string(),
            "--search-listen",
            &http_address.to_string(),
            "--elasticsearch",
            &es.join(","),
            "--credentials",
        ])
        .arg(directory.join("credentials.json"))
        .arg("--index-tokens")
        .arg(directory.join("admin.token"))
        .stdin(std::process::Stdio::null())
        .stderr(log.try_clone()?)
        .stdout(log)
        .spawn()?;
        Ok(Self {
            child,
            endpoint: format!("http://{http_address}"),
        })
    }

    async fn ready(&mut self, client: &reqwest::Client) -> anyhow::Result<()> {
        for _ in 0..100 {
            anyhow::ensure!(self.child.try_wait()?.is_none(), "HTTP frontend exited");
            if let Ok(response) = client
                .get(format!("{}/lexical/openapi.json", self.endpoint))
                .send()
                .await
                && response.status().is_success()
            {
                return Ok(());
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        anyhow::bail!("HTTP frontend readiness expired")
    }

    async fn query(&self, client: &reqwest::Client, payload: &Value) -> anyhow::Result<Value> {
        Ok(client
            .post(format!(
                "{}/v1/workspaces/tenant/lexical/documents/query",
                self.endpoint
            ))
            .bearer_auth("reader")
            .json(payload)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }
}

impl Drop for SearchProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

mod support;

fn main() {
    support::main(vec![
        libtest_mimic::Trial::test(
            "stateless_search_filters_before_pagination_and_checks_current_authority",
            || {
                support::run(
                    stateless_search_filters_before_pagination_and_checks_current_authority(),
                )
            },
        )
        .with_ignored_flag(true),
    ]);
}
