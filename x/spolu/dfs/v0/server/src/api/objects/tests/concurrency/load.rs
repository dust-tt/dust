//! Repeatable handler/SlateDB load measurements without HTTP sockets or FUSE.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Instant,
};

use futures::{StreamExt, TryStreamExt, stream};
use tokio::sync::Barrier;

use super::*;
use crate::storage::{CacheConfig, WriteMode};

mod content;

/// @cc [owner:spolu,label:testing;performance] concurrent-api-measurements
/// Use real session authorization, API handlers, and SlateDB. Each writer MUST own a distinct file;
/// count conflicts and errors rather than hiding them with client retries. Validate final revisions
/// and contents outside timed intervals. Results MUST identify the local object store and exclusion
/// of client caching, HTTP transport, FUSE, and GCS latency; they are not NFS comparisons.
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
#[ignore = "Explicit API load benchmark; run with --release --ignored --nocapture."]
async fn concurrent_metadata_load() -> Result<()> {
    for clients in [1, 16, 100] {
        measure(clients, None).await?;
    }
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
#[ignore = "Explicit cache-check load diagnostic; excludes actual client caching and networking."]
async fn concurrent_cache_poll_load() -> Result<()> {
    for interval in [Duration::ZERO, Duration::from_millis(100)] {
        measure(100, Some(interval)).await?;
    }
    Ok(())
}

async fn measure(clients: usize, poll_interval: Option<Duration>) -> Result<()> {
    const ROUNDS: usize = 20;
    let directory = tempfile::tempdir()?;
    let (f, writers) = fixture(clients, WriteMode::Cached, directory.path()).await?;
    measure_metadata(f, writers, poll_interval, ROUNDS).await
}

async fn fixture(
    clients: usize,
    write_mode: WriteMode,
    directory: &std::path::Path,
) -> Result<(Fixture, Vec<(ObjectMetadata, String)>)> {
    let mut storage = Storage::open(Arc::new(InMemory::new()), &"load".parse()?).await?;
    storage.enable_cache(CacheConfig {
        write_mode,
        cache_dir: directory.to_owned(),
        ..Default::default()
    })?;
    let f = Fixture::from_storage(Arc::new(storage), crate::files::FileConfig::default()).await?;
    let mut batch = MetadataBatch::default();
    let mut writers = Vec::new();
    for index in 0..clients {
        let mut file = f.files[0].clone();
        file.id = ObjectId::generate();
        file.parent = Some(ParentLink {
            parent_id: f.shared.id,
            name: format!("load-{index}").parse()?,
        });
        let version = ContentVersionId::generate();
        file.kind = ObjectKind::File(FileContent {
            version,
            size_bytes: 4096,
        });
        add_object(&mut batch, &file)?;
        batch.uploads.push(
            f.storage
                .workspace(&f.workspace)?
                .upload_blob(
                    file.id,
                    version,
                    stream::iter([Ok(Bytes::from(vec![42; 4096]))]),
                )
                .await?,
        );
        writers.push((file, f.session_key(&["reader"]).await?));
    }
    f.storage.workspace(&f.workspace)?.commit(batch).await?;
    Ok((f, writers))
}

async fn measure_metadata(
    f: Fixture,
    writers: Vec<(ObjectMetadata, String)>,
    poll_interval: Option<Duration>,
    rounds: usize,
) -> Result<()> {
    let clients = writers.len();
    let barrier = Arc::new(Barrier::new(
        clients * if poll_interval.is_some() { 2 } else { 1 },
    ));
    let stopped = Arc::new(AtomicBool::new(false));
    let started = Instant::now();
    let mut watchers = Vec::new();
    if let Some(interval) = poll_interval {
        for (_, key) in &writers {
            let app = f.app.clone();
            let key = key.clone();
            let stopped = stopped.clone();
            let barrier = barrier.clone();
            watchers.push(tokio::spawn(async move {
                let mut revision = Value::Null;
                let mut count = 0;
                barrier.wait().await;
                while !stopped.load(Ordering::Acquire) {
                    let start = Instant::now();
                    let (status, body) = call(
                        &app,
                        "POST",
                        "/sessions/cache",
                        Some(&key),
                        json!({"revision":revision}),
                    )
                    .await?;
                    ensure!(status == StatusCode::OK && body["revision"].is_u64());
                    revision = body["revision"].clone();
                    count += 1;
                    let remaining = interval.saturating_sub(start.elapsed());
                    if !remaining.is_zero() {
                        tokio::time::sleep(remaining).await;
                    }
                }
                Ok::<_, anyhow::Error>(count)
            }));
        }
    }
    let jobs = writers
        .into_iter()
        .map(|(file, key)| {
            let app = f.app.clone();
            let barrier = barrier.clone();
            tokio::spawn(async move {
                let id = file.id.to_string();
                let mut revision = 0_u64;
                let mut conflicts = 0_usize;
                let mut reads_us = Vec::new();
                let mut writes_us = Vec::new();
                barrier.wait().await;
                for _ in 0..rounds {
                    for _ in 0..10 {
                        let start = Instant::now();
                        let (status, body) = call(
                            &app,
                            "POST",
                            "/objects/stat",
                            Some(&key),
                            json!({"object_id":id}),
                        )
                        .await?;
                        reads_us.push(start.elapsed().as_micros() as u64);
                        ensure!(status == StatusCode::OK && body["metadata_revision"] == revision);
                    }
                    let start = Instant::now();
                    let (status, _) = call(
                        &app,
                        "POST",
                        "/objects/update",
                        Some(&key),
                        json!({"object_id":id,"expected_metadata_revision":revision,
                           "mode":if revision.is_multiple_of(2) { 384 } else { 420 }}),
                    )
                    .await?;
                    writes_us.push(start.elapsed().as_micros() as u64);
                    match status {
                        StatusCode::OK => revision += 1,
                        StatusCode::CONFLICT => conflicts += 1,
                        _ => anyhow::bail!("unexpected mutation status {status}"),
                    }
                }
                Ok::<_, anyhow::Error>((file, revision, conflicts, reads_us, writes_us))
            })
        })
        .collect::<Vec<_>>();
    let results = stream::iter(jobs)
        .buffer_unordered(clients)
        .map(|result| {
            result
                .map_err(anyhow::Error::from)
                .and_then(|result| result)
        })
        .try_collect::<Vec<_>>()
        .await?;
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    stopped.store(true, Ordering::Release);
    let mut cache_checks = 0;
    for watcher in watchers {
        cache_checks += watcher.await??;
    }
    let mut reads_us = Vec::new();
    let mut writes_us = Vec::new();
    let mut conflicts = 0;
    let scoped = f.storage.workspace(&f.workspace)?;
    let view = scoped.read_view().await?;
    for (file, revision, failed, reads, writes) in results {
        let actual = view.object(file.id).await?.context("final file")?;
        ensure!(actual.metadata_revision.get() == revision && actual.kind == file.kind);
        let ObjectKind::File(content) = actual.kind else {
            anyhow::bail!("expected file")
        };
        let bytes = scoped
            .read_blob_stream(file.id, &content, 0, 4096)
            .await?
            .stream
            .try_collect::<Vec<_>>()
            .await?
            .concat();
        ensure!(bytes == vec![42; 4096]);
        conflicts += failed;
        reads_us.extend(reads);
        writes_us.extend(writes);
    }
    drop(view);
    eprintln!(
        "{}",
        json!({
            "benchmark":"in-process-metadata", "object_store":"memory", "write_mode":"cached",
            "cache_check_interval_ms":poll_interval.map(|interval| interval.as_millis()),
            "cache_checks":cache_checks,
            "clients":clients, "rounds":rounds, "read_write_ratio":10,
            "elapsed_ms":elapsed_ms, "reads":reads_us.len(), "writes":writes_us.len(),
            "conflicts":conflicts, "read_latency_us":latencies(reads_us),
            "write_latency_us":latencies(writes_us),
        })
    );
    f.close().await
}

fn latencies(mut samples: Vec<u64>) -> Value {
    samples.sort_unstable();
    let percentile = |percent: usize| {
        samples
            .get((samples.len() * percent).div_ceil(100).saturating_sub(1))
            .copied()
            .unwrap_or_default()
    };
    json!({"p50":percentile(50),"p95":percentile(95),"p99":percentile(99),
           "max":samples.last().copied().unwrap_or_default()})
}
