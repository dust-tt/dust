use dfs_poc::{
    client::Client,
    engine::{Engine, Limits, token_hash},
    model::*,
};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::Path,
    process::{Child, Command, Stdio},
    time::Duration,
};

fn credentials() -> Vec<Credential> {
    ["admin", "reader"]
        .map(|name| Credential {
            token_hash: token_hash(name),
            tenant: "recovery".into(),
            issuer: "test".into(),
            subject: name.into(),
            principal: name.into(),
            admin: name == "admin",
            scope: None,
            expires_ms: u64::MAX,
        })
        .to_vec()
}
fn copy_tree(source: &Path, destination: &Path) {
    std::fs::create_dir_all(destination).unwrap();
    for entry in std::fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let dest = destination.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &dest);
        } else {
            std::fs::copy(entry.path(), dest).unwrap();
        }
    }
}
async fn start(directory: &Path, phase: Option<&str>, after: u64) -> (Child, Client) {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let credentials_path = directory.join("credentials.json");
    std::fs::write(
        &credentials_path,
        serde_json::to_vec(&credentials()).unwrap(),
    )
    .unwrap();
    let mut command = Command::new(env!("CARGO_BIN_EXE_dfsd"));
    command.args([
        "--db",
        directory.join("db").to_str().unwrap(),
        "--credentials",
        credentials_path.to_str().unwrap(),
        "--listen",
        &address.to_string(),
        "--sync-ms",
        if phase.is_some_and(|p| p.ends_with("persist")) {
            "10"
        } else {
            "600000"
        },
    ]);
    if let Some(phase) = phase {
        command.args(["--fault-phase", phase, "--fault-after", &after.to_string()]);
    }
    let mut child = command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    for _ in 0..100 {
        if let Ok(client) = Client::connect(&format!("http://{address}"), "admin", None).await {
            return (child, client);
        }
        if let Some(status) = child.try_wait().unwrap() {
            panic!("server failed before login: {status}");
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    child.kill().unwrap();
    child.wait().unwrap();
    panic!("server startup deadline");
}
async fn network_digest(client: &Client) -> String {
    let view = client.view().await.unwrap();
    let mut data = BTreeMap::new();
    for item in view.nodes {
        let bytes = if item.node.kind == Kind::File {
            match client
                .call(Call::Read {
                    node: item.node.id.clone(),
                    version: None,
                    offset: 0,
                    size: MAX_IO_BYTES as u32,
                    handle: None,
                })
                .await
                .unwrap()
            {
                Reply::Data(bytes) => bytes,
                _ => panic!("read reply"),
            }
        } else {
            Vec::new()
        };
        data.insert(item.node.id.clone(), (item.node, bytes));
    }
    format!("{:x}", Sha256::digest(bincode::serialize(&data).unwrap()))
}
fn recovered_digest(engine: &Engine, session: &Session) -> String {
    let mut data = BTreeMap::new();
    for item in engine.view(&session.id).unwrap().nodes {
        let bytes = if item.node.kind == Kind::File {
            engine
                .read(
                    &session.id,
                    &item.node.id,
                    None,
                    0,
                    MAX_IO_BYTES as u32,
                    None,
                )
                .unwrap()
        } else {
            Vec::new()
        };
        data.insert(item.node.id.clone(), (item.node, bytes));
    }
    format!("{:x}", Sha256::digest(bincode::serialize(&data).unwrap()))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sigkill_and_torn_wal_recover_exact_accepted_prefix() {
    let directory = scratch();
    let (mut child, client) = start(directory.path(), None, 0).await;
    let root = client.view().await.unwrap().nodes[0].node.id.clone();
    let mut digests = vec![network_digest(&client).await];
    let mut accepted = Vec::new();
    for index in 0..12 {
        let create = Mutation::Create {
            parent: root.clone(),
            name: format!("file-{index}"),
            kind: Kind::File,
            mode: 0o600,
        };
        let request = client.session.request_id();
        let Reply::Outcome(outcome) = client
            .call(Call::Mutate {
                request: request.clone(),
                mutation: create.clone(),
            })
            .await
            .unwrap()
        else {
            panic!("create reply")
        };
        let node = outcome.node.unwrap();
        accepted.push((request, create));
        digests.push(network_digest(&client).await);
        let mutation = Mutation::Write {
            node: node.id.clone(),
            base: node.version,
            offset: 0,
            data: vec![index as u8; 64 * 1024],
            append: false,
            handle: None,
        };
        let request = client.session.request_id();
        client
            .call(Call::Mutate {
                request: request.clone(),
                mutation: mutation.clone(),
            })
            .await
            .unwrap();
        accepted.push((request, mutation));
        digests.push(network_digest(&client).await);
        let mutation = Mutation::Grant {
            node: node.id,
            subject: "reader".into(),
            verbs: READ,
        };
        let request = client.session.request_id();
        client
            .call(Call::Mutate {
                request: request.clone(),
                mutation: mutation.clone(),
            })
            .await
            .unwrap();
        accepted.push((request, mutation));
        digests.push(network_digest(&client).await);
    }
    child.kill().unwrap();
    child.wait().unwrap();
    let source = directory.path().join("db");
    let mut wals: Vec<_> = std::fs::read_dir(&source)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "log"))
        .collect();
    wals.sort();
    let wal = wals.last().unwrap();
    let wal_bytes = std::fs::metadata(wal).unwrap().len();
    let mut results = Vec::new();
    for fraction in [100, 99, 90, 50, 10] {
        let restored = directory.path().join(format!("restore-{fraction}"));
        copy_tree(&source, &restored);
        let keep = wal_bytes * fraction / 100;
        if fraction != 100 {
            std::fs::OpenOptions::new()
                .write(true)
                .open(restored.join(wal.file_name().unwrap()))
                .unwrap()
                .set_len(keep)
                .unwrap();
        }
        let engine = Engine::open(&restored, credentials(), Limits::default()).unwrap();
        let session = engine.login("admin").unwrap();
        let head = engine.head(&session.id).unwrap().0 as usize;
        assert!(head <= accepted.len());
        assert_eq!(recovered_digest(&engine, &session), digests[head]);
        assert_eq!(
            engine.head(&client.session.id).unwrap_err().code,
            libc::ESTALE
        );
        for (index, (request, mutation)) in accepted.iter().enumerate() {
            let outcome = engine.mutate(&session.id, request.clone(), mutation.clone());
            if index < head {
                assert_eq!(outcome.unwrap().head as usize, index + 1);
            } else {
                assert_eq!(outcome.unwrap_err().code, libc::ESTALE);
            }
        }
        engine.validate("recovery").unwrap();
        results.push(serde_json::json!({"model":if fraction == 100 {"process_sigkill"} else {"offline_torn_wal_model"},"wal_bytes":wal_bytes,"kept_bytes":keep,"acknowledged_mutations":accepted.len(),"recovered_head":head,"lost_acknowledged_mutations":accepted.len()-head,"prefix_matches":true}));
    }
    let output = Path::new(env!("CARGO_MANIFEST_DIR")).join("results/recovery-prefix.json");
    std::fs::write(output, serde_json::to_vec_pretty(&results).unwrap()).unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn injected_publication_and_persistence_boundaries_are_atomic() {
    let mut results = Vec::new();
    for phase in [
        "before_publish",
        "after_publish",
        "before_persist",
        "after_persist",
    ] {
        let directory = scratch();
        let (mut child, client) = start(directory.path(), Some(phase), 1).await;
        let root = client.view().await.unwrap().nodes[0].node.id.clone();
        let result = client
            .mutate(Mutation::Create {
                parent: root,
                name: "atomic".into(),
                kind: Kind::File,
                mode: 0o600,
            })
            .await;
        for _ in 0..100 {
            if child.try_wait().unwrap().is_some() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert!(
            child.try_wait().unwrap().is_some(),
            "fault did not fire: {phase}"
        );
        let engine = Engine::open(
            directory.path().join("db"),
            credentials(),
            Limits::default(),
        )
        .unwrap();
        let session = engine.login("admin").unwrap();
        let head = engine.head(&session.id).unwrap().0;
        assert_eq!(head, if phase == "before_publish" { 0 } else { 1 });
        engine.validate("recovery").unwrap();
        results.push(serde_json::json!({"phase":phase,"acknowledged":result.is_ok(),"recovered_head":head,"consistent":true}));
    }
    std::fs::write(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("results/recovery-boundaries.json"),
        serde_json::to_vec_pretty(&results).unwrap(),
    )
    .unwrap();
}

fn scratch() -> tempfile::TempDir {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("runtime/tests");
    std::fs::create_dir_all(&root).unwrap();
    tempfile::tempdir_in(root).unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn persisted_publication_receipt_survives_process_sigkill() {
    let directory = scratch();
    let (mut child, client) = start(directory.path(), None, 0).await;
    let root = client.view().await.unwrap().nodes[0].node.id.clone();
    let node = client
        .mutate(Mutation::Create {
            parent: root,
            name: "durable".into(),
            kind: Kind::File,
            mode: 0o600,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    let mutation = Mutation::Write {
        node: node.id,
        base: node.version,
        offset: 0,
        data: b"fsync acknowledged".to_vec(),
        append: false,
        handle: None,
    };
    let identity = client.prepare_publication(&mutation).unwrap();
    let publication = client.publish(identity.clone(), mutation).await.unwrap();
    let confirmed = client
        .persist_through(publication.receipt.clone())
        .await
        .unwrap();
    let before = network_digest(&client).await;
    child.kill().unwrap();
    child.wait().unwrap();
    let (mut restarted, recovered) = start(directory.path(), None, 0).await;
    let after = network_digest(&recovered).await;
    let resolution = recovered
        .resolve_publication(identity)
        .await
        .unwrap()
        .unwrap();
    let confirmation = recovered
        .persist_through(publication.receipt.clone())
        .await
        .unwrap();
    let metrics = match recovered.call(Call::Metrics).await.unwrap() {
        Reply::Metrics(metrics) => metrics,
        _ => panic!("metrics reply"),
    };
    restarted.kill().unwrap();
    restarted.wait().unwrap();
    assert_eq!(before, after);
    assert_eq!(resolution.receipt, publication.receipt);
    assert_ne!(confirmation.incarnation, confirmed.incarnation);
    assert_eq!(metrics.published, publication.receipt.tenant_head);
    assert_eq!(metrics.pending_bytes, 0);
}
