use axum::{
    body::{Body, to_bytes},
    http::{Request, header},
};
use tower::ServiceExt;

use super::*;
use crate::{api::objects::tests::files::write_to, model::RequestId};

/// @cc [owner:spolu,label:testing;performance] concurrent-content-measurements
/// Compare identical workloads through real API handlers and SlateDB in both write modes. Keep
/// network/FUSE/client caches/GCS latency explicitly outside the measurement. Validate every read
/// and final file, count failed writes without retrying them, and report persistence drain separately
/// from foreground latency. Setup, final verification, and shutdown MUST remain outside timing.
#[tokio::test(flavor = "multi_thread", worker_threads = 8)]
#[ignore = "Explicit mixed-content load diagnostic; run with --release --ignored --nocapture."]
async fn concurrent_content_load() -> Result<()> {
    for clients in [1, 16, 100] {
        for mode in [WriteMode::Sync, WriteMode::Cached] {
            measure(clients, mode).await?;
        }
    }
    Ok(())
}

#[derive(Default)]
struct Samples {
    reads_us: Vec<u64>,
    writes_us: Vec<u64>,
    fsync_us: Vec<u64>,
    failures: Vec<u16>,
}

async fn measure(clients: usize, mode: WriteMode) -> Result<()> {
    const ROUNDS: u8 = 20;
    let directory = tempfile::tempdir()?;
    let (f, writers) = fixture(clients, mode, directory.path()).await?;
    let mut opened = Vec::new();
    for (file, key) in writers {
        let (status, body) = call(
            &f.app,
            "POST",
            "/files/open",
            Some(&key),
            json!({"object_id":file.id.to_string(),"read":true,"write":true}),
        )
        .await?;
        ensure!(status == StatusCode::OK);
        opened.push((file, key, text(&body, "handle_id")?.to_owned()));
    }
    f.storage.drain_persistence().await?;
    let barrier = Arc::new(Barrier::new(clients + 1));
    let mut jobs = Vec::new();
    for (file, key, handle) in opened {
        let app = f.app.clone();
        let parent = f.shared.id.to_string();
        let barrier = barrier.clone();
        jobs.push(tokio::spawn(async move {
            let id = file.id.to_string();
            let name = file.parent.as_ref().context("parent")?.name.as_str();
            let mut samples = Samples::default();
            let mut revision = 0;
            let mut expected = Bytes::from(vec![42; 4096]);
            barrier.wait().await;
            for round in 1..=ROUNDS {
                for operation in 0..10 {
                    let start = Instant::now();
                    match operation {
                        0..=6 => {
                            let (status, body) = call(
                                &app,
                                "POST",
                                "/objects/stat",
                                Some(&key),
                                json!({"object_id":id}),
                            )
                            .await?;
                            ensure!(
                                status == StatusCode::OK && body["metadata_revision"] == revision
                            );
                        }
                        7 => {
                            let (status, body) = call(
                                &app,
                                "POST",
                                "/objects/lookup",
                                Some(&key),
                                json!({"parent_id":parent,"name":name}),
                            )
                            .await?;
                            ensure!(status == StatusCode::OK && body["object_id"] == id);
                        }
                        8 => {
                            let (status, body) = call(
                                &app,
                                "POST",
                                "/objects/list",
                                Some(&key),
                                json!({"directory_id":parent,"limit":32}),
                            )
                            .await?;
                            ensure!(status == StatusCode::OK);
                            let entries = body["entries"].as_array().context("entries")?;
                            ensure!(entries.len() == (clients + 3).min(32));
                        }
                        _ => {
                            let bytes = read(&app, &key, &id).await?;
                            ensure!(bytes == expected);
                        }
                    }
                    samples.reads_us.push(start.elapsed().as_micros() as u64);
                }
                let bytes = Bytes::from(vec![round; 4096]);
                let start = Instant::now();
                let (status, receipt) = write_to(
                    &app,
                    &key,
                    &handle,
                    RequestId::generate(),
                    u64::from(round),
                    0,
                    4096,
                    Body::from(bytes.clone()),
                )
                .await?;
                samples.writes_us.push(start.elapsed().as_micros() as u64);
                if status != StatusCode::OK {
                    samples.failures.push(status.as_u16());
                    break;
                }
                revision += 1;
                ensure!(receipt["metadata_revision"] == revision && receipt["size_bytes"] == 4096);
                expected = bytes;
                let start = Instant::now();
                let (status, _) = call(
                    &app,
                    "POST",
                    "/files/fsync",
                    Some(&key),
                    json!({"handle_id":handle,"through_sequence":round}),
                )
                .await?;
                samples.fsync_us.push(start.elapsed().as_micros() as u64);
                ensure!(status == StatusCode::NO_CONTENT);
            }
            Ok::<_, anyhow::Error>((file.id, revision, expected, samples))
        }));
    }
    let started = Instant::now();
    barrier.wait().await;
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
    let started = Instant::now();
    f.storage.drain_persistence().await?;
    let drain_ms = started.elapsed().as_secs_f64() * 1000.0;
    let mut samples = Samples::default();
    let view = f.storage.workspace(&f.workspace)?.read_view().await?;
    for (id, revision, expected, worker) in results {
        let actual = view.object(id).await?.context("final object")?;
        ensure!(actual.metadata_revision.get() == revision);
        ensure!(read(&f.app, &f.key, &id.to_string()).await? == expected);
        samples.reads_us.extend(worker.reads_us);
        samples.writes_us.extend(worker.writes_us);
        samples.fsync_us.extend(worker.fsync_us);
        samples.failures.extend(worker.failures);
    }
    drop(view);
    eprintln!(
        "{}",
        json!({
            "benchmark":"in-process-content", "object_store":"memory",
            "write_mode": match mode { WriteMode::Sync => "sync", WriteMode::Cached => "cached" },
            "clients":clients, "rounds":ROUNDS, "read_write_ratio":10, "file_bytes":4096,
            "elapsed_ms":elapsed_ms, "remaining_drain_ms":drain_ms,
            "reads":samples.reads_us.len(), "attempted_writes":samples.writes_us.len(),
            "successful_writes":samples.fsync_us.len(), "failed_statuses":samples.failures,
            "read_latency_us":latencies(samples.reads_us),
            "write_latency_us":latencies(samples.writes_us), "fsync_latency_us":latencies(samples.fsync_us),
        })
    );
    f.close().await
}

async fn read(app: &Router, key: &str, id: &str) -> Result<Bytes> {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/objects/read")
                .header(header::AUTHORIZATION, format!("Bearer {key}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(
                    &json!({"object_id":id,"offset":0,"length":4096}),
                )?))?,
        )
        .await?;
    ensure!(response.status() == StatusCode::OK);
    Ok(to_bytes(response.into_body(), 4096).await?)
}
