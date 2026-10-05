use dfs_poc::{
    cache::Cache,
    client::Client,
    engine::{Engine, Limits, token_hash},
    model::*,
    rpc::Service,
};
use std::sync::{Arc, atomic::Ordering};
use tokio::sync::oneshot;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn independent_clients_stream_snapshot_cache_and_publish() {
    let dir = scratch();
    let credentials = vec![Credential {
        token_hash: token_hash("secret"),
        tenant: id(),
        issuer: "test".into(),
        subject: "admin".into(),
        principal: id(),
        admin: true,
        scope: None,
        expires_ms: u64::MAX,
    }];
    let engine = Arc::new(Engine::open(dir.path(), credentials, Limits::default()).unwrap());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let (stop, stopped) = oneshot::channel();
    let server = tokio::spawn(
        tonic::transport::Server::builder()
            .add_service(Service::new(engine.clone()).server())
            .serve_with_incoming_shutdown(
                tokio_stream::wrappers::TcpListenerStream::new(listener),
                async {
                    let _ = stopped.await;
                },
            ),
    );
    let a = Client::connect(&endpoint, "secret", None).await.unwrap();
    let b = Client::connect(&endpoint, "secret", None).await.unwrap();
    assert_ne!(a.session.id, b.session.id);
    let view = a.view().await.unwrap();
    let root = &view.nodes[0].node.id;
    assert_eq!(
        a.view_with_limit(view.nodes.len() - 1)
            .await
            .unwrap_err()
            .code,
        libc::EOVERFLOW
    );
    assert_eq!(
        a.view_with_limit(view.nodes.len()).await.unwrap().nodes,
        view.nodes
    );
    let node = a
        .mutate(Mutation::Create {
            parent: root.clone(),
            name: "hello".into(),
            kind: Kind::File,
            mode: 0o644,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    let mut stream = b
        .rpc
        .clone()
        .watch(dfs_poc::rpc::encode(&b.session.id).unwrap())
        .await
        .unwrap()
        .into_inner();
    let count = a.counters.calls.load(Ordering::Relaxed);
    let node = a
        .mutate(Mutation::Write {
            node: node.id,
            base: node.version,
            offset: 0,
            data: b"published".to_vec(),
            append: false,
            handle: None,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    assert_eq!(a.counters.calls.load(Ordering::Relaxed) - count, 1);
    assert!(matches!(a.call(Call::Barrier).await.unwrap(), Reply::Unit));
    let reply = b
        .call(Call::Read {
            node: node.id.clone(),
            version: None,
            offset: 0,
            size: 64,
            handle: None,
        })
        .await
        .unwrap();
    assert!(matches!(reply, Reply::Data(bytes) if bytes == b"published"));
    tokio::time::timeout(std::time::Duration::from_secs(1), stream.message())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let view = b.view().await.unwrap();
    let bytes: usize = view.nodes.iter().map(ViewNode::namespace_bytes).sum();
    assert_eq!(
        b.view_with_limits(100_000, bytes - 1)
            .await
            .unwrap_err()
            .code,
        libc::EOVERFLOW
    );
    let exact = b.view_with_limits(view.nodes.len(), bytes).await.unwrap();
    assert_eq!(exact.nodes, view.nodes);
    let mut cache = Cache::new(exact, 1024).unwrap();
    cache.prefetch(&b, 1024).await.unwrap();
    let before = b.counters.calls.load(Ordering::Relaxed);
    for _ in 0..100 {
        assert_eq!(cache.content.chunk(&node, 0).unwrap(), b"published");
        assert_eq!(cache.namespace.nodes[&node.id].node.size, 9);
    }
    assert_eq!(b.counters.calls.load(Ordering::Relaxed), before);
    let request = id();
    let Reply::WritebackHandle(writer) = a
        .call(Call::OpenWriteback {
            node: node.id.clone(),
            request: request.clone(),
        })
        .await
        .unwrap()
    else {
        panic!("writer handle reply")
    };
    let Reply::WritebackHandle(retry) = a
        .call(Call::OpenWriteback {
            node: node.id.clone(),
            request,
        })
        .await
        .unwrap()
    else {
        panic!("writer retry reply")
    };
    assert_eq!(writer.handle, retry.handle);
    assert_eq!(
        b.call(Call::OpenWriteback {
            node: node.id.clone(),
            request: id()
        })
        .await
        .unwrap_err()
        .code,
        libc::EBUSY
    );
    let publication = Mutation::Write {
        node: node.id.clone(),
        base: writer.node.version.clone(),
        offset: 0,
        data: b"exclusive".to_vec(),
        append: false,
        handle: Some(writer.handle.clone()),
    };
    let identity = a.prepare_publication(&publication).unwrap();
    let published = a.publish(identity.clone(), publication).await.unwrap();
    assert_eq!(published.outcome.node.unwrap().size, 9);
    let Reply::Data(bytes) = b
        .call(Call::Read {
            node: node.id.clone(),
            version: None,
            offset: 0,
            size: 9,
            handle: None,
        })
        .await
        .unwrap()
    else {
        panic!("reader reply")
    };
    assert_eq!(bytes, b"exclusive");
    let Reply::WriterLease(renewed) = a
        .call(Call::RenewWriteback {
            handle: writer.handle.clone(),
        })
        .await
        .unwrap()
    else {
        panic!("writer renewal reply")
    };
    assert_eq!(renewed.generation, writer.lease.generation);
    a.call(Call::Close {
        handle: writer.handle,
    })
    .await
    .unwrap();
    let Reply::WritebackHandle(replacement) = b
        .call(Call::OpenWriteback {
            node: node.id.clone(),
            request: id(),
        })
        .await
        .unwrap()
    else {
        panic!("replacement writer reply")
    };
    assert_ne!(replacement.lease.generation, writer.lease.generation);
    assert!(a.resolve_publication(identity).await.unwrap().is_some());
    b.call(Call::Close {
        handle: replacement.handle,
    })
    .await
    .unwrap();
    assert_eq!(engine.metrics(&a.session.id).unwrap().persisted, 0);
    drop(stream);
    a.call(Call::Logout).await.unwrap();
    b.call(Call::Logout).await.unwrap();
    stop.send(()).unwrap();
    server.await.unwrap().unwrap();
}

fn scratch() -> tempfile::TempDir {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("runtime/tests");
    std::fs::create_dir_all(&root).unwrap();
    tempfile::tempdir_in(root).unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn half_open_connection_has_complete_rpc_deadline() {
    use std::sync::atomic::AtomicBool;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let dir = scratch();
    let engine = Arc::new(
        Engine::open(
            dir.path(),
            vec![Credential {
                token_hash: token_hash("secret"),
                tenant: id(),
                issuer: "test".into(),
                subject: "admin".into(),
                principal: id(),
                admin: true,
                scope: None,
                expires_ms: u64::MAX,
            }],
            Limits::default(),
        )
        .unwrap(),
    );
    let backend = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let backend_address = backend.local_addr().unwrap();
    let server = tokio::spawn(
        tonic::transport::Server::builder()
            .add_service(Service::new(engine).server())
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(backend)),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let paused = Arc::new(AtomicBool::new(false));
    let proxy_paused = paused.clone();
    let proxy = tokio::spawn(async move {
        let (mut incoming, _) = listener.accept().await.unwrap();
        let mut upstream = tokio::net::TcpStream::connect(backend_address)
            .await
            .unwrap();
        let mut left = vec![0; 65536];
        let mut right = vec![0; 65536];
        loop {
            tokio::select! {
                count = incoming.read(&mut left) => {
                    let count = count.unwrap();
                    if count == 0 { break; }
                    if proxy_paused.load(Ordering::SeqCst) { std::future::pending::<()>().await; }
                    upstream.write_all(&left[..count]).await.unwrap();
                }
                count = upstream.read(&mut right) => {
                    let count = count.unwrap();
                    if count == 0 { break; }
                    if proxy_paused.load(Ordering::SeqCst) { std::future::pending::<()>().await; }
                    incoming.write_all(&right[..count]).await.unwrap();
                }
            }
        }
    });
    let client = Client::connect(&endpoint, "secret", None).await.unwrap();
    paused.store(true, Ordering::SeqCst);
    let started = std::time::Instant::now();
    let error = tokio::time::timeout(std::time::Duration::from_secs(18), client.call(Call::Head))
        .await
        .unwrap()
        .unwrap_err();
    assert_eq!(error.code, libc::ETIMEDOUT);
    assert_eq!(client.counters.calls.load(Ordering::SeqCst), 3);
    assert!(started.elapsed() < std::time::Duration::from_secs(17));
    proxy.abort();
    server.abort();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn stream_floods_are_isolated_by_tenant_and_kind_and_release_on_disconnect() {
    use dfs_poc::{
        rpc::{StreamLimits, decode, encode},
        wire::dfs_server::Dfs,
    };
    use futures::StreamExt;
    use tonic::{Code, Request};
    let dir = scratch();
    let credentials = ["a", "b", "c"]
        .into_iter()
        .map(|tenant| Credential {
            token_hash: token_hash(tenant),
            tenant: tenant.into(),
            issuer: "test".into(),
            subject: "admin".into(),
            principal: id(),
            admin: true,
            scope: None,
            expires_ms: u64::MAX,
        })
        .collect();
    let engine = Arc::new(Engine::open(dir.path(), credentials, Limits::default()).unwrap());
    let a = engine.login("a").unwrap();
    let a_second = engine.login("a").unwrap();
    let b = engine.login("b").unwrap();
    let c = engine.login("c").unwrap();
    let root = engine.view(&a.id).unwrap().nodes[0].node.id.clone();
    for index in 0..800 {
        engine
            .mutate(
                &a.id,
                a.request_id(),
                Mutation::Create {
                    parent: root.clone(),
                    name: format!("file-{index}"),
                    kind: Kind::File,
                    mode: 0o644,
                },
            )
            .unwrap();
    }
    let service = Service::new(engine.clone())
        .with_stream_limits(StreamLimits {
            snapshots: 2,
            tenant_snapshots: 1,
            watches: 2,
            tenant_watches: 1,
        })
        .unwrap();
    let mut snapshot = service
        .snapshot(Request::new(encode(&a.id).unwrap()))
        .await
        .unwrap()
        .into_inner();
    assert!(
        matches!(service.snapshot(Request::new(encode(&a_second.id).unwrap())).await, Err(error) if error.code() == Code::ResourceExhausted)
    );
    let watch_a = service
        .watch(Request::new(encode(&a.id).unwrap()))
        .await
        .unwrap()
        .into_inner();
    assert!(
        matches!(service.watch(Request::new(encode(&a_second.id).unwrap())).await, Err(error) if error.code() == Code::ResourceExhausted)
    );
    let watch_b = service
        .watch(Request::new(encode(&b.id).unwrap()))
        .await
        .unwrap()
        .into_inner();
    assert!(
        matches!(service.watch(Request::new(encode(&c.id).unwrap())).await, Err(error) if error.code() == Code::ResourceExhausted)
    );
    let mut snapshot_b = service
        .snapshot(Request::new(encode(&b.id).unwrap()))
        .await
        .unwrap()
        .into_inner();
    assert!(
        matches!(service.snapshot(Request::new(encode(&c.id).unwrap())).await, Err(error) if error.code() == Code::ResourceExhausted)
    );
    let unary = service
        .call(Request::new(
            encode(&Envelope {
                session: a.id.clone(),
                call: Call::Head,
            })
            .unwrap(),
        ))
        .await
        .unwrap();
    assert!(matches!(
        decode::<Result<Reply>>(unary.into_inner())
            .unwrap()
            .unwrap(),
        Reply::Head { head: 800, .. }
    ));
    let mut nodes = Vec::new();
    let mut ended = false;
    while let Some(frame) = snapshot.next().await {
        match decode::<Result<SnapshotPart>>(frame.unwrap())
            .unwrap()
            .unwrap()
        {
            SnapshotPart::Begin { head, .. } => assert_eq!(head, 800),
            SnapshotPart::Nodes(chunk) => {
                assert!(chunk.len() <= 256);
                nodes.extend(chunk);
            }
            SnapshotPart::End => ended = true,
        }
    }
    assert!(ended);
    assert_eq!(nodes, engine.view(&a.id).unwrap().nodes);
    assert!(snapshot_b.next().await.is_some());
    drop(snapshot_b);
    drop(watch_a);
    let replacement = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            match service
                .watch(Request::new(encode(&a_second.id).unwrap()))
                .await
            {
                Ok(stream) => break stream,
                Err(error) => {
                    assert_eq!(error.code(), Code::ResourceExhausted);
                    tokio::task::yield_now().await;
                }
            }
        }
    })
    .await
    .unwrap();
    drop(replacement);
    drop(watch_b);
    let abandoned = service
        .snapshot(Request::new(encode(&a.id).unwrap()))
        .await
        .unwrap();
    drop(abandoned);
    let replacement = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            match service
                .snapshot(Request::new(encode(&a_second.id).unwrap()))
                .await
            {
                Ok(stream) => break stream,
                Err(error) => {
                    assert_eq!(error.code(), Code::ResourceExhausted);
                    tokio::task::yield_now().await;
                }
            }
        }
    })
    .await
    .unwrap();
    let mut replacement = replacement.into_inner();
    assert!(matches!(
        decode::<Result<SnapshotPart>>(replacement.next().await.unwrap().unwrap())
            .unwrap()
            .unwrap(),
        SnapshotPart::Begin { .. }
    ));
    engine
        .mutate(
            &a.id,
            a.request_id(),
            Mutation::Grant {
                node: root,
                subject: "reader".into(),
                verbs: READ,
            },
        )
        .unwrap();
    let mut rejected = false;
    while let Some(frame) = replacement.next().await {
        match decode::<Result<SnapshotPart>>(frame.unwrap()).unwrap() {
            Ok(SnapshotPart::End) => panic!("snapshot crossed an authorization change"),
            Err(error) => {
                assert_eq!(error.code, libc::ESTALE);
                rejected = true;
            }
            _ => {}
        }
    }
    assert!(rejected);
}
