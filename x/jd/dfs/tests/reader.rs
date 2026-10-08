use dfs_poc::{
    cache::Cache,
    client::Client,
    engine::{Engine, Limits, token_hash},
    model::*,
    reader::{ReadLimits, ReadRequest, Reader},
    rpc::Service,
};
use parking_lot::{Mutex, RwLock};
use std::sync::{Arc, atomic::Ordering};

struct Fixture {
    _directory: tempfile::TempDir,
    server: tokio::task::JoinHandle<()>,
    client: Client,
    cache: Arc<Mutex<Cache>>,
    nodes: Vec<Node>,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.server.abort();
    }
}
impl Fixture {
    async fn new(budget: usize) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let credential = Credential {
            token_hash: token_hash("reader-test"),
            tenant: id(),
            issuer: "test".into(),
            subject: "admin".into(),
            principal: id(),
            admin: true,
            scope: None,
            expires_ms: u64::MAX,
        };
        let engine =
            Arc::new(Engine::open(directory.path(), vec![credential], Limits::default()).unwrap());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(Service::new(engine).server())
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        let client = Client::connect(&endpoint, "reader-test", None)
            .await
            .unwrap();
        let root = client.view().await.unwrap().nodes[0].node.id.clone();
        let mut nodes = Vec::new();
        for index in 0..8 {
            let node = client
                .mutate(Mutation::Create {
                    parent: root.clone(),
                    name: format!("file-{index}"),
                    kind: Kind::File,
                    mode: 0o644,
                })
                .await
                .unwrap()
                .node
                .unwrap();
            let node = client
                .mutate(Mutation::Write {
                    node: node.id,
                    base: node.version,
                    offset: 0,
                    data: vec![index as u8; CHUNK_BYTES * 4 + 17],
                    append: false,
                    handle: None,
                })
                .await
                .unwrap()
                .node
                .unwrap();
            nodes.push(node);
        }
        let cache = Arc::new(Mutex::new(
            Cache::new(client.view().await.unwrap(), budget).unwrap(),
        ));
        Self {
            _directory: directory,
            server,
            client,
            cache,
            nodes,
        }
    }
    fn reader(&self, ahead: usize) -> Arc<Reader> {
        Reader::new(
            self.cache.clone(),
            Arc::new(RwLock::new(self.client.clone())),
            ahead,
        )
    }
    fn request(&self, index: usize, offset: u64, size: u32) -> ReadRequest {
        let cache = self.cache.lock();
        ReadRequest {
            node: self.nodes[index].clone(),
            remote: None,
            incarnation: self.client.session.incarnation.clone(),
            auth_generation: cache.namespace.auth_generation,
            view_head: cache.namespace.head,
            unlinked: false,
            sequential: false,
            offset,
            size,
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn demand_reads_fetch_only_needed_blocks_and_survive_eviction() {
    let fixture = Fixture::new(CHUNK_BYTES * 2).await;
    let before = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    let reader = fixture.reader(0);
    assert_eq!(fixture.cache.lock().content.bytes, 0);
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed),
        before
    );
    for cycle in 0..3 {
        for index in 0..8 {
            let offset = if cycle == 0 {
                100
            } else {
                CHUNK_BYTES as u64 - 2
            };
            assert_eq!(
                reader
                    .read(fixture.request(index, offset, 7))
                    .await
                    .unwrap()
                    .as_ref(),
                vec![index as u8; 7]
            );
            assert!(fixture.cache.lock().content.bytes <= CHUNK_BYTES * 2);
        }
    }
    let calls = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    assert_eq!(
        reader
            .read(fixture.request(7, CHUNK_BYTES as u64 - 2, 7))
            .await
            .unwrap()
            .as_ref(),
        vec![7; 7]
    );
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed),
        calls
    );
    assert_eq!(
        reader
            .read(fixture.request(3, CHUNK_BYTES as u64 * 4 + 10, 4096))
            .await
            .unwrap()
            .as_ref(),
        vec![3; 7]
    );
    assert!(fixture.cache.lock().content.evicted_bytes > 0);
    assert_eq!(reader.counters.snapshot()["prefetch_bytes"], 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn queued_reads_cannot_use_old_authority_or_incarnation() {
    let fixture = Fixture::new(CHUNK_BYTES * 2).await;
    let reader = fixture.reader(0);
    let request = fixture.request(0, 0, 16);
    reader.read(request.clone()).await.unwrap();
    fixture
        .client
        .mutate(Mutation::Grant {
            node: fixture.nodes[7].id.clone(),
            subject: "other-reader".into(),
            verbs: READ,
        })
        .await
        .unwrap();
    let view = fixture.client.view().await.unwrap();
    assert!(fixture.cache.lock().replace(view).unwrap().is_empty());
    assert_eq!(reader.read(request).await.unwrap_err().code, libc::EACCES);
    let request = fixture.request(0, 0, 16);
    let calls = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    assert_eq!(
        reader.read(request.clone()).await.unwrap().as_ref(),
        vec![0; 16]
    );
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed),
        calls
    );
    fixture
        .cache
        .lock()
        .namespace
        .nodes
        .get_mut(&fixture.nodes[0].id)
        .unwrap()
        .verbs = 0;
    assert_eq!(
        reader.read(request.clone()).await.unwrap_err().code,
        libc::EACCES
    );
    fixture.cache.lock().namespace.incarnation = id();
    assert_eq!(reader.read(request).await.unwrap_err().code, libc::ESTALE);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn speculation_is_bounded_and_cannot_displace_demanded_blocks() {
    let fixture = Fixture::new(CHUNK_BYTES * 4).await;
    let reader = fixture.reader(CHUNK_BYTES * 4);
    for index in 0..3 {
        assert_eq!(
            reader
                .read(fixture.request(index, CHUNK_BYTES as u64 * 4, 17))
                .await
                .unwrap()
                .as_ref(),
            vec![index as u8; 17]
        );
    }
    {
        let mut cache = fixture.cache.lock();
        for index in 3..8 {
            cache.content.insert_speculative(
                &fixture.nodes[index],
                0,
                vec![index as u8; CHUNK_BYTES],
            );
        }
        for index in 0..3 {
            assert_eq!(
                cache.content.chunk(&fixture.nodes[index], 4).unwrap(),
                vec![index as u8; 17]
            );
        }
        assert!(cache.content.speculative_bytes <= CHUNK_BYTES);
        assert!(cache.content.bytes <= CHUNK_BYTES * 4);
        assert!(cache.content.prefetch_evicted_bytes > 0);
        cache.content.shared_chunk(&fixture.nodes[7], 0).unwrap();
        assert_eq!(cache.content.prefetch_used_bytes, CHUNK_BYTES as u64);
        let ranges = cache.adjacent_ranges(&fixture.nodes[0], 0, CHUNK_BYTES * 4, true);
        assert!(ranges.iter().map(|r| r.size as usize).sum::<usize>() <= CHUNK_BYTES * 4);
    }
    reader.read(fixture.request(0, 0, 16)).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert!(fixture.cache.lock().content.bytes <= CHUNK_BYTES * 4);
    assert!(
        reader.counters.snapshot()["prefetch_calls"]
            .as_u64()
            .unwrap()
            <= 1
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn contiguous_requested_blocks_share_one_rpc() {
    let fixture = Fixture::new(CHUNK_BYTES * 8).await;
    let reader = fixture.reader(0);
    let before = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    assert_eq!(
        reader
            .read(fixture.request(6, 17, (CHUNK_BYTES * 3) as u32))
            .await
            .unwrap()
            .as_ref(),
        vec![6; CHUNK_BYTES * 3]
    );
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed) - before,
        1
    );
    assert_eq!(fixture.cache.lock().content.bytes, CHUNK_BYTES * 4);
    assert_eq!(
        reader
            .read(fixture.request(6, 200, 100))
            .await
            .unwrap()
            .as_ref(),
        vec![6; 100]
    );
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed) - before,
        1
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_readers_share_a_block_fetch_and_prefix_reads_do_not_speculate() {
    let fixture = Fixture::new(CHUNK_BYTES * 8).await;
    let reader = fixture.reader(CHUNK_BYTES * 4);
    let before = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    let requests = (0..32).map(|_| reader.read(fixture.request(2, 0, 4096)));
    for result in futures::future::join_all(requests).await {
        assert_eq!(result.unwrap().as_ref(), vec![2; 4096]);
    }
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed) - before,
        1
    );
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(reader.counters.snapshot()["prefetch_calls"], 0);
    assert_eq!(fixture.cache.lock().content.bytes, CHUNK_BYTES);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn adjacent_file_access_triggers_bounded_nonrecursive_prefetch() {
    let fixture = Fixture::new(CHUNK_BYTES * 16).await;
    let reader = fixture.reader(CHUNK_BYTES * 4);
    for index in 0..2 {
        let size = fixture.nodes[index].size as u32;
        assert_eq!(
            reader
                .read(fixture.request(index, 0, size))
                .await
                .unwrap()
                .as_ref(),
            vec![index as u8; size as usize]
        );
    }
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    loop {
        if fixture
            .cache
            .lock()
            .content
            .chunk(&fixture.nodes[2], 0)
            .is_some()
        {
            break;
        }
        assert!(tokio::time::Instant::now() < deadline);
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    let calls = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    assert_eq!(
        reader
            .read(fixture.request(2, 0, 4096))
            .await
            .unwrap()
            .as_ref(),
        vec![2; 4096]
    );
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed),
        calls
    );
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert_eq!(reader.counters.snapshot()["prefetch_calls"], 1);
    assert_eq!(
        reader.counters.snapshot()["prefetch_bytes"],
        CHUNK_BYTES * 4
    );
    assert!(fixture.cache.lock().content.bytes <= CHUNK_BYTES * 16);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn interleaved_directories_preserve_adjacent_access_prediction() {
    let mut fixture = Fixture::new(CHUNK_BYTES * 16).await;
    let root = fixture.nodes[0].parent.clone().unwrap();
    let directory = fixture
        .client
        .mutate(Mutation::Create {
            parent: root,
            name: "other".into(),
            kind: Kind::Directory,
            mode: 0o755,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    for index in 4..8 {
        fixture.nodes[index] = fixture
            .client
            .mutate(Mutation::Rename {
                expected: fixture.nodes[index].entry_token.clone(),
                parent: fixture.nodes[index].parent.clone().unwrap(),
                name: fixture.nodes[index].name.clone(),
                new_parent: directory.id.clone(),
                new_name: fixture.nodes[index].name.clone(),
                destination: None,
            })
            .await
            .unwrap()
            .node
            .unwrap();
    }
    let view = fixture.client.view().await.unwrap();
    fixture.cache.lock().replace(view).unwrap();
    let reader = fixture.reader(CHUNK_BYTES * 4);
    for index in [0, 4, 1] {
        let size = fixture.nodes[index].size as u32;
        assert_eq!(
            reader
                .read(fixture.request(index, 0, size))
                .await
                .unwrap()
                .as_ref(),
            vec![index as u8; size as usize]
        );
    }
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while fixture
            .cache
            .lock()
            .content
            .chunk(&fixture.nodes[2], 0)
            .is_none()
        {
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let calls = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    assert_eq!(
        reader
            .read(fixture.request(2, 0, 4096))
            .await
            .unwrap()
            .as_ref(),
        vec![2; 4096]
    );
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed),
        calls
    );
    assert_eq!(reader.counters.snapshot()["prefetch_calls"], 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cached_eof_on_a_callback_thread_triggers_adjacent_prediction() {
    let fixture = Fixture::new(CHUNK_BYTES * 16).await;
    let reader = fixture.reader(CHUNK_BYTES * 4);
    for index in 0..2 {
        let size = fixture.nodes[index].size as u32;
        reader
            .read(fixture.request(index, 0, size - 16))
            .await
            .unwrap();
        let mut request = fixture.request(index, u64::from(size - 16), 16);
        request.sequential = true;
        let callback_reader = reader.clone();
        assert_eq!(
            std::thread::spawn(move || callback_reader.cached_read(&request).unwrap().unwrap())
                .join()
                .unwrap()
                .as_ref(),
            vec![index as u8; 16]
        );
    }
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while fixture
            .cache
            .lock()
            .content
            .chunk(&fixture.nodes[2], 0)
            .is_none()
        {
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(reader.counters.snapshot()["prefetch_calls"], 1);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cached_replies_cover_eof_and_preserve_authority() {
    let fixture = Fixture::new(CHUNK_BYTES * 2).await;
    let reader = fixture.reader(0);
    let request = fixture.request(4, 0, 4096);
    assert!(reader.cached_read(&request).unwrap().is_none());
    reader.read(request.clone()).await.unwrap();
    let before = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    assert_eq!(
        reader.cached_read(&request).unwrap().unwrap().as_ref(),
        vec![4; 4096]
    );
    assert!(
        reader
            .cached_read(&fixture.request(4, fixture.nodes[4].size + 1024, 4096))
            .unwrap()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed),
        before
    );
    fixture.cache.lock().namespace.auth_generation += 1;
    assert_eq!(reader.cached_read(&request).unwrap_err().code, libc::EACCES);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn completed_reads_cannot_repopulate_an_invalidated_version() {
    let fixture = Fixture::new(CHUNK_BYTES * 2).await;
    let reader = fixture.reader(0);
    let request = fixture.request(0, 0, 4096);
    let unlinked = ReadRequest {
        unlinked: true,
        ..request.clone()
    };
    fixture.cache.lock().namespace.head += 1;
    assert_eq!(reader.validate(&unlinked).unwrap_err().code, libc::ESTALE);
    reader.read(request.clone()).await.unwrap();
    let replacement = fixture
        .client
        .mutate(Mutation::Write {
            node: request.node.id.clone(),
            base: request.node.version.clone(),
            offset: 0,
            data: vec![9; 4096],
            append: false,
            handle: None,
        })
        .await
        .unwrap()
        .node
        .unwrap();
    fixture
        .cache
        .lock()
        .namespace
        .update(replacement.clone())
        .unwrap();
    assert_eq!(reader.validate(&request).unwrap_err().code, libc::ESTALE);
    assert_eq!(reader.cached_read(&request).unwrap_err().code, libc::ESTALE);
    assert_eq!(
        reader.read(request.clone()).await.unwrap_err().code,
        libc::ESTALE
    );
    let fresh = ReadRequest {
        node: replacement,
        ..request
    };
    assert_eq!(reader.read(fresh).await.unwrap().as_ref(), vec![9; 4096]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn cached_read_pins_blocks_across_speculative_promotion() {
    let fixture = Fixture::new(CHUNK_BYTES * 4).await;
    let reader = fixture.reader(CHUNK_BYTES);
    {
        let mut cache = fixture.cache.lock();
        for index in 1..4 {
            cache
                .content
                .insert(&fixture.nodes[5], index, vec![5; CHUNK_BYTES]);
        }
        cache
            .content
            .insert_speculative(&fixture.nodes[5], 0, vec![5; CHUNK_BYTES]);
    }
    let request = fixture.request(5, 0, (CHUNK_BYTES * 4) as u32);
    assert_eq!(
        reader.cached_read(&request).unwrap().unwrap().as_ref(),
        vec![5; CHUNK_BYTES * 4]
    );
    assert!(fixture.cache.lock().content.bytes <= CHUNK_BYTES * 4);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn zero_residency_keeps_demand_rpc_coalescing_and_speculation() {
    let fixture = Fixture::new(0).await;
    let reader = fixture.reader(CHUNK_BYTES * 2);
    for index in 0..2 {
        let before = fixture.client.counters.data_calls.load(Ordering::Relaxed);
        let size = fixture.nodes[index].size as u32;
        assert_eq!(
            reader
                .read(fixture.request(index, 0, size))
                .await
                .unwrap()
                .as_ref(),
            vec![index as u8; size as usize]
        );
        let calls = fixture.client.counters.data_calls.load(Ordering::Relaxed) - before;
        assert!((1..=2).contains(&calls));
        assert_eq!(fixture.cache.lock().content.bytes, 0);
    }
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    while reader.counters.snapshot()["prefetch_bytes"]
        .as_u64()
        .unwrap()
        == 0
    {
        assert!(tokio::time::Instant::now() < deadline);
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    assert_eq!(
        reader.counters.snapshot()["prefetch_bytes"],
        CHUNK_BYTES * 2
    );
    assert_eq!(fixture.cache.lock().content.bytes, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn rpc_byte_limit_is_independent_of_retained_capacity() {
    let fixture = Fixture::new(0).await;
    let reader = Reader::with_limits(
        fixture.cache.clone(),
        Arc::new(RwLock::new(fixture.client.clone())),
        0,
        ReadLimits {
            rpc_bytes: 2 * CHUNK_BYTES,
            demand_inflight_bytes: 4 * CHUNK_BYTES,
            ..ReadLimits::default()
        },
    )
    .unwrap();
    let before = fixture.client.counters.data_calls.load(Ordering::Relaxed);
    let request = fixture.request(3, 7, fixture.nodes[3].size as u32 - 7);
    assert_eq!(
        reader.read(request.clone()).await.unwrap().as_ref(),
        vec![3; request.size as usize]
    );
    assert_eq!(
        fixture.client.counters.data_calls.load(Ordering::Relaxed) - before,
        3
    );
    assert_eq!(fixture.cache.lock().content.bytes, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn completed_reply_keeps_its_byte_reservation_until_consumed() {
    let fixture = Fixture::new(2 * MAX_IO_BYTES).await;
    let reader = Reader::with_limits(
        fixture.cache.clone(),
        Arc::new(RwLock::new(fixture.client.clone())),
        0,
        ReadLimits {
            reply_bytes: MAX_IO_BYTES,
            ..ReadLimits::default()
        },
    )
    .unwrap();
    let held = reader
        .read(fixture.request(0, 0, MAX_IO_BYTES as u32))
        .await
        .unwrap();
    assert_eq!(
        reader.counters.snapshot()["reply_reserved_bytes"],
        MAX_IO_BYTES
    );
    let request = fixture.request(0, 0, 4096);
    assert!(reader.cached_read(&request).unwrap().is_none());
    let pending_reader = reader.clone();
    let pending_request = request.clone();
    let pending = tokio::spawn(async move { pending_reader.read(pending_request).await });
    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    assert!(!pending.is_finished());
    assert_eq!(reader.counters.snapshot()["reply_waits"], 1);
    pending.abort();
    assert!(pending.await.unwrap_err().is_cancelled());
    assert_eq!(
        reader.counters.snapshot()["reply_reserved_bytes"],
        MAX_IO_BYTES
    );
    let pending_reader = reader.clone();
    let pending = tokio::spawn(async move { pending_reader.read(request).await });
    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    assert!(!pending.is_finished());
    drop(held);
    let result = tokio::time::timeout(std::time::Duration::from_secs(2), pending)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(result.as_ref(), vec![0; 4096]);
    assert_eq!(reader.counters.snapshot()["reply_reserved_bytes"], 4096);
    drop(result);
    assert_eq!(reader.counters.snapshot()["reply_reserved_bytes"], 0);
    assert_eq!(
        reader.counters.snapshot()["peak_reply_reserved_bytes"],
        MAX_IO_BYTES
    );
    let mut revoked = fixture.request(0, 0, 4096);
    revoked.auth_generation += 1;
    assert_eq!(reader.read(revoked).await.unwrap_err().code, libc::EACCES);
    assert_eq!(reader.counters.snapshot()["reply_reserved_bytes"], 0);
}
