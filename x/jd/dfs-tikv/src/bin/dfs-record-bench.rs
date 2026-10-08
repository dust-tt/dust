use clap::Parser;
use dfs_tikv::{Commit, Config, Store};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Barrier;

#[derive(Parser)]
struct Args {
    #[arg(long, value_delimiter = ',')]
    pd: Vec<String>,
    #[arg(long)]
    output: std::path::PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let mut results = Vec::new();
    for shared in [false, true] {
        for workers in [1usize, 4, 8] {
            let config = Config::new(
                args.pd.clone(),
                format!("records-{}", uuid::Uuid::new_v4().simple()),
            );
            let barrier = Arc::new(Barrier::new(workers));
            let mut stores = Vec::new();
            for _ in 0..workers {
                stores.push(Store::connect(config.clone()).await?);
            }
            let started = Instant::now();
            let mut tasks = Vec::new();
            for (worker, store) in stores.into_iter().enumerate() {
                let barrier = barrier.clone();
                tasks.push(tokio::spawn(async move {
                    let mut conflicts = 0u64;
                    let mut latencies = Vec::new();
                    barrier.wait().await;
                    for iteration in 0..30u64 {
                        let begin = Instant::now();
                        let key = if shared {
                            "shared".to_owned()
                        } else {
                            format!("worker/{worker}")
                        };
                        let mut done = false;
                        for _ in 0..512 {
                            let mut batch = store.snapshot("same-tenant").await?.batch();
                            let value = batch
                                .get(key.as_bytes())
                                .await?
                                .map(|v| bincode::deserialize::<u64>(&v))
                                .transpose()?
                                .unwrap_or(0);
                            batch
                                .put(key.as_bytes(), &bincode::serialize(&(value + 1))?)
                                .await?;
                            if matches!(batch.commit().await?, Commit::Published { .. }) {
                                done = true;
                                break;
                            }
                            conflicts += 1;
                            tokio::time::sleep(std::time::Duration::from_millis(
                                1 + (worker as u64 + iteration) % 7,
                            ))
                            .await;
                        }
                        anyhow::ensure!(done, "record benchmark exhausted retries");
                        latencies.push(begin.elapsed().as_secs_f64() * 1000.0);
                    }
                    Ok::<_, anyhow::Error>((conflicts, latencies))
                }));
            }
            let mut conflicts = 0u64;
            let mut latencies = Vec::new();
            for task in tasks {
                let (n, l) = task.await??;
                conflicts += n;
                latencies.extend(l);
            }
            let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
            latencies.sort_by(f64::total_cmp);
            let verify = Store::connect(config).await?;
            let snapshot = verify.snapshot("same-tenant").await?;
            for worker in 0..if shared { 1 } else { workers } {
                let key = if shared {
                    "shared".to_owned()
                } else {
                    format!("worker/{worker}")
                };
                let actual: u64 =
                    bincode::deserialize(&snapshot.get(key.as_bytes()).await?.unwrap())?;
                anyhow::ensure!(
                    actual == 30 * if shared { workers as u64 } else { 1 },
                    "lost update"
                );
            }
            results.push(serde_json::json!({"shared_record":shared,"workers":workers,"operations":workers*30,"elapsed_ms":elapsed_ms,"operations_per_second":workers as f64*30000.0/elapsed_ms,"conflicts":conflicts,"median_ms":latencies[latencies.len()/2],"p95_ms":latencies[(latencies.len()*95/100).min(latencies.len()-1)],"verified":true}));
        }
    }
    let value = serde_json::json!({"backend":"txnkv","scope":"independent storage clients in one process; same tenant, disjoint or shared records; not a filesystem scaling test","passed":true,"results":results});
    std::fs::write(args.output, serde_json::to_vec_pretty(&value)?)?;
    println!("{value}");
    Ok(())
}
