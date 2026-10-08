use clap::Parser;
use dfs_poc::{client::Client, model::*};
use serde::Serialize;
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

#[derive(Parser)]
struct Args {
    #[arg(long, default_value = "http://127.0.0.1:7443")]
    endpoint: String,
    #[arg(long)]
    token_file: PathBuf,
    #[arg(long)]
    ca: Option<PathBuf>,
    #[arg(long, default_value_t = 1000)]
    samples: usize,
    #[arg(long, default_value_t = 1)]
    workers: usize,
    #[arg(long, default_value_t = 4096)]
    payload_bytes: usize,
    #[arg(long, default_value_t = 0)]
    pace_us: u64,
    #[arg(long)]
    output: PathBuf,
}
#[derive(Serialize)]
struct Sample {
    worker: usize,
    sample: usize,
    start_ms: u64,
    latency_us: u64,
    head: Option<u64>,
    error: Option<i32>,
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    anyhow::ensure!(
        args.workers > 0 && args.workers <= 64 && args.payload_bytes <= MAX_IO_BYTES,
        "invalid load bounds"
    );
    let token = std::fs::read_to_string(args.token_file)?;
    let ca = args.ca.map(std::fs::read).transpose()?;
    let control = Client::connect(&args.endpoint, token.trim(), ca.clone()).await?;
    let root = control
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|node| node.visible_name == "files" && node.visible_parent.is_none())
        .ok_or_else(|| anyhow::anyhow!("normal root absent"))?
        .node
        .id;
    let directory = control
        .mutate(Mutation::Create {
            parent: root,
            name: format!("load-{}", id()),
            kind: Kind::Directory,
            mode: 0o755,
        })
        .await?
        .node
        .ok_or_else(|| anyhow::anyhow!("create reply"))?;
    let before = control.call(Call::Metrics).await?;
    let started = Instant::now();
    let mut tasks = Vec::new();
    for worker in 0..args.workers {
        let client = Client::connect(&args.endpoint, token.trim(), ca.clone()).await?;
        let mut node = client
            .mutate(Mutation::Create {
                parent: directory.id.clone(),
                name: format!("worker-{worker}"),
                kind: Kind::File,
                mode: 0o600,
            })
            .await?
            .node
            .ok_or_else(|| anyhow::anyhow!("create reply"))?;
        tasks.push(tokio::spawn(async move {
            let mut samples = Vec::new();
            let mut random = worker as u64 + 42;
            for sample in 0..args.samples {
                let data: Vec<_> = (0..args.payload_bytes)
                    .map(|_| {
                        random ^= random << 13;
                        random ^= random >> 7;
                        random ^= random << 17;
                        random as u8
                    })
                    .collect();
                let start_ms = now_ms();
                let started = Instant::now();
                let result = client
                    .mutate(Mutation::Write {
                        node: node.id.clone(),
                        base: node.version.clone(),
                        offset: 0,
                        data,
                        append: false,
                        handle: None,
                    })
                    .await;
                let latency_us = started.elapsed().as_micros() as u64;
                let (head, error) = match result {
                    Ok(outcome) => {
                        if let Some(updated) = outcome.node {
                            node = updated;
                        }
                        (Some(outcome.head), None)
                    }
                    Err(error) => (None, Some(error.code)),
                };
                samples.push(Sample {
                    worker,
                    sample,
                    start_ms,
                    latency_us,
                    head,
                    error,
                });
                if args.pace_us > 0 {
                    tokio::time::sleep(Duration::from_micros(args.pace_us)).await;
                }
            }
            let counters = client.counters.snapshot();
            let _ = client.call(Call::Logout).await;
            (samples, counters)
        }));
    }
    let mut samples = Vec::new();
    let mut counters = Vec::new();
    for task in tasks {
        let (batch, count) = task.await?;
        samples.extend(batch);
        counters.push(count);
    }
    let elapsed_seconds = started.elapsed().as_secs_f64();
    let after = control.call(Call::Metrics).await?;
    control.call(Call::Logout).await?;
    let mut latencies: Vec<_> = samples
        .iter()
        .filter(|s| s.error.is_none())
        .map(|s| s.latency_us)
        .collect();
    latencies.sort();
    let percentile = |p: f64| {
        latencies
            .get(((latencies.len().saturating_sub(1)) as f64 * p).ceil() as usize)
            .copied()
    };
    let output = serde_json::json!({"workers":args.workers,"samples_per_worker":args.samples,"payload_bytes":args.payload_bytes,"elapsed_seconds":elapsed_seconds,
        "successful":latencies.len(),"errors":samples.len()-latencies.len(),"throughput_per_second":latencies.len() as f64 / elapsed_seconds,
        "publication_p50_us":percentile(0.50),"publication_p99_us":percentile(0.99),"before":before,"after":after,"counters":counters,"samples":samples});
    std::fs::write(args.output, serde_json::to_vec_pretty(&output)?)?;
    anyhow::ensure!(
        latencies.len() == args.workers * args.samples,
        "load contained failed mutations"
    );
    Ok(())
}
