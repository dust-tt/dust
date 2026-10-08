#[path = "support/namespace_races.rs"]
mod namespace_races;

use dfs_poc::{
    client::Client,
    engine::{Engine, Limits, token_hash},
    model::*,
    rpc::Service,
};
use namespace_races::{CASES, Schedule, create, deletion, head, movement, read, run_case, writing};
use std::{sync::Arc, time::Duration};
use tokio::sync::oneshot;

struct Fixture {
    directory: tempfile::TempDir,
    credentials: Vec<Credential>,
    a: Client,
    b: Client,
    root: Id,
    stop: oneshot::Sender<()>,
    server: tokio::task::JoinHandle<std::result::Result<(), tonic::transport::Error>>,
}

impl Fixture {
    async fn new() -> Self {
        Self::with_b_admin(true).await
    }

    async fn with_b_admin(b_admin: bool) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let tenant = id();
        let credentials: Vec<_> = [("secret", true), ("writer", b_admin)]
            .into_iter()
            .map(|(token, admin)| Credential {
                token_hash: token_hash(token),
                tenant: tenant.clone(),
                issuer: "test".into(),
                subject: token.into(),
                principal: token.into(),
                admin,
                scope: None,
                expires_ms: u64::MAX,
            })
            .collect();
        let engine = Arc::new(
            Engine::open(directory.path(), credentials.clone(), Limits::default()).unwrap(),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let (stop, stopped) = oneshot::channel();
        let server = tokio::spawn(
            tonic::transport::Server::builder()
                .add_service(Service::new(engine).server())
                .serve_with_incoming_shutdown(
                    tokio_stream::wrappers::TcpListenerStream::new(listener),
                    async {
                        let _ = stopped.await;
                    },
                ),
        );
        let a = Client::connect(&endpoint, "secret", None).await.unwrap();
        let b = Client::connect(&endpoint, "writer", None).await.unwrap();
        let root = a
            .view()
            .await
            .unwrap()
            .nodes
            .into_iter()
            .find(|n| n.visible_name == "files" && n.visible_parent.is_none())
            .unwrap()
            .node
            .id;
        Self {
            directory,
            credentials,
            a,
            b,
            root,
            stop,
            server,
        }
    }

    async fn shutdown(self) {
        let marker = Mutation::Create {
            parent: self.root.clone(),
            name: format!("persist-{}", id()),
            kind: Kind::File,
            mode: 0o600,
        };
        let identity = self.a.prepare_publication(&marker).unwrap();
        let publication = self.a.publish(identity, marker).await.unwrap();
        self.a.persist_through(publication.receipt).await.unwrap();
        let expected = self.a.view().await.unwrap();
        let mut contents = Vec::new();
        for entry in &expected.nodes {
            if entry.node.kind == Kind::File {
                contents.push((
                    entry.node.id.clone(),
                    read(&self.a, &entry.node.id, None).await.unwrap(),
                ));
            }
        }
        self.a.call(Call::Logout).await.unwrap();
        self.b.call(Call::Logout).await.unwrap();
        self.stop.send(()).unwrap();
        self.server.await.unwrap().unwrap();
        let engine =
            Engine::open(self.directory.path(), self.credentials, Limits::default()).unwrap();
        let session = engine.login("secret").unwrap();
        let recovered = engine.view(&session.id).unwrap();
        assert_eq!(expected.head, recovered.head);
        assert_eq!(expected.nodes, recovered.nodes);
        for (node, bytes) in contents {
            assert_eq!(
                engine.read(&session.id, &node, None, 0, 64, None).unwrap(),
                bytes
            );
        }
        engine.validate(&session.tenant).unwrap();
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn independent_clients_obey_namespace_race_matrix() {
    let fixture = Fixture::new().await;
    for case in CASES {
        for (schedule, repetitions) in [
            (Schedule::AThenB, 1),
            (Schedule::BThenA, 1),
            (Schedule::Concurrent, 8),
        ] {
            for sample in 0..repetitions {
                let record = tokio::time::timeout(
                    Duration::from_secs(30),
                    run_case(
                        &fixture.a,
                        &fixture.b,
                        &fixture.root,
                        *case,
                        schedule,
                        sample,
                    ),
                )
                .await
                .unwrap()
                .unwrap();
                assert!(record.passed, "{record:#?}");
            }
        }
    }
    fixture.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn reused_paths_reject_stale_tokens_and_retries_preserve_identity() {
    let f = Fixture::new().await;
    let source = create(&f.a, &f.root, "src", Kind::File).await.unwrap();
    let mutation = movement(&source, &f.root, "dest", None);
    let publication = f.a.prepare_publication(&mutation).unwrap();
    let first =
        f.a.publish(publication.clone(), mutation.clone())
            .await
            .unwrap();
    let replacement = create(&f.b, &f.root, "src", Kind::File).await.unwrap();
    assert_ne!(source.id, replacement.id);
    let before = head(&f.a).await.unwrap();
    for stale in [deletion(&source), movement(&source, &f.root, "other", None)] {
        assert_eq!(f.b.mutate(stale).await.unwrap_err().code, libc::ESTALE);
    }
    let replay = f.a.publish(publication, mutation).await.unwrap();
    assert_eq!(replay.outcome.head, first.outcome.head);
    assert_eq!(replay.outcome.node.unwrap().id, source.id);
    assert_eq!(head(&f.a).await.unwrap(), before);
    f.b.mutate(writing(&source, b"moved", None)).await.unwrap();
    assert_eq!(read(&f.a, &source.id, None).await.unwrap(), b"moved");
    assert!(read(&f.a, &replacement.id, None).await.unwrap().is_empty());
    let Reply::Lookup(current, _) =
        f.a.call(Call::Lookup {
            parent: f.root.clone(),
            name: "src".into(),
        })
        .await
        .unwrap()
    else {
        panic!("lookup")
    };
    assert_eq!(current.id, replacement.id);
    f.a.mutate(deletion(&current)).await.unwrap();
    let third = create(&f.a, &f.root, "src", Kind::File).await.unwrap();
    assert_ne!(third.id, replacement.id);
    assert_eq!(
        f.b.mutate(writing(&replacement, b"stale", None))
            .await
            .unwrap_err()
            .code,
        libc::ENOENT
    );
    assert!(read(&f.a, &third.id, None).await.unwrap().is_empty());
    f.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn move_rechecks_inherited_write_authority_even_with_an_open_handle() {
    let f = Fixture::with_b_admin(false).await;
    let allowed = create(&f.a, &f.root, "allowed", Kind::Directory)
        .await
        .unwrap();
    let private = create(&f.a, &f.root, "private", Kind::Directory)
        .await
        .unwrap();
    f.a.mutate(Mutation::Grant {
        node: allowed.id.clone(),
        subject: f.b.session.principal.clone(),
        verbs: READ | WRITE | LIST | TRAVERSE,
    })
    .await
    .unwrap();
    for schedule in [Schedule::AThenB, Schedule::BThenA, Schedule::Concurrent] {
        for sample in 0..8 {
            let name = format!("{}-{sample}", id());
            let source = create(&f.a, &allowed.id, &name, Kind::File).await.unwrap();
            let source =
                f.a.mutate(writing(&source, b"seed", None))
                    .await
                    .unwrap()
                    .node
                    .unwrap();
            let Reply::Handle(handle, _) =
                f.b.call(Call::Open {
                    node: source.id.clone(),
                    write: true,
                })
                .await
                .unwrap()
            else {
                panic!("handle reply")
            };
            let ma = movement(&source, &private.id, &name, None);
            let mb = writing(&source, b"BBBB", Some(handle.clone()));
            let before = head(&f.a).await.unwrap();
            let (ra, rb) = match schedule {
                Schedule::AThenB => (f.a.mutate(ma).await, f.b.mutate(mb).await),
                Schedule::BThenA => {
                    let rb = f.b.mutate(mb).await;
                    (f.a.mutate(ma).await, rb)
                }
                Schedule::Concurrent => tokio::join!(f.a.mutate(ma), f.b.mutate(mb)),
            };
            let moved = ra.unwrap();
            match (&schedule, &rb) {
                (Schedule::AThenB, Err(e)) => assert_eq!(e.code, libc::EACCES),
                (Schedule::BThenA, Ok(written)) => assert!(written.head < moved.head),
                (Schedule::Concurrent, Ok(written)) => assert!(written.head < moved.head),
                (Schedule::Concurrent, Err(e)) => assert_eq!(e.code, libc::EACCES),
                _ => panic!("authority ordering mismatch: {schedule:?}, {rb:?}"),
            }
            assert_eq!(
                head(&f.a).await.unwrap(),
                before + 1 + u64::from(rb.is_ok())
            );
            assert_eq!(
                read(&f.a, &source.id, None).await.unwrap(),
                if rb.is_ok() { b"BBBB" } else { b"seed" }
            );
            let current = moved.node.unwrap();
            assert_eq!(
                f.b.mutate(writing(&current, b"leak", Some(handle.clone())))
                    .await
                    .unwrap_err()
                    .code,
                libc::EACCES
            );
            assert_eq!(
                f.b.call(Call::Read {
                    node: source.id,
                    version: None,
                    offset: 0,
                    size: 4,
                    handle: Some(handle.clone())
                })
                .await
                .unwrap_err()
                .code,
                libc::EACCES
            );
            f.b.call(Call::Close { handle }).await.unwrap();
        }
    }
    f.shutdown().await;
}
