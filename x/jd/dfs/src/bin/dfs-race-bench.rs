#[path = "../../tests/support/namespace_races.rs"]
mod namespace_races;

use anyhow::ensure;
use clap::Parser;
use dfs_poc::{client::Client, model::*};
use namespace_races::{CASES, Schedule, create, run_case};
use std::{collections::BTreeMap, io::Write, path::PathBuf, time::Duration};

#[derive(Parser)]
struct Args {
    #[arg(long, default_value = "http://127.0.0.1:7443")]
    endpoint: String,
    #[arg(long)]
    token_file: PathBuf,
    #[arg(long)]
    ca: Option<PathBuf>,
    #[arg(long, default_value_t = 100)]
    samples: usize,
    #[arg(long)]
    output: PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    ensure!(
        (1..=1000).contains(&args.samples),
        "samples must be 1..1000"
    );
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&args.output)?;
    let token = std::fs::read_to_string(args.token_file)?;
    let ca = args.ca.map(std::fs::read).transpose()?;
    let a = Client::connect(&args.endpoint, token.trim(), ca.clone()).await?;
    let b = Client::connect(&args.endpoint, token.trim(), ca).await?;
    let root = a
        .view()
        .await?
        .nodes
        .into_iter()
        .find(|node| node.visible_name == "files" && node.visible_parent.is_none())
        .ok_or_else(|| anyhow::anyhow!("normal root absent"))?
        .node
        .id;
    let directory = create(&a, &root, &format!("concurrency-{}", id()), Kind::Directory).await?;
    let mut latency: BTreeMap<String, Vec<u64>> = BTreeMap::new();
    let mut count = 0;
    for case in CASES {
        for (schedule, repetitions) in [
            (Schedule::AThenB, 1),
            (Schedule::BThenA, 1),
            (Schedule::Concurrent, args.samples),
        ] {
            for sample in 0..repetitions {
                let result = tokio::time::timeout(
                    Duration::from_secs(60),
                    run_case(&a, &b, &directory.id, *case, schedule, sample),
                )
                .await;
                let record = match result {
                    Ok(Ok(record)) => record,
                    failure => {
                        serde_json::to_writer(
                            &mut output,
                            &serde_json::json!({"case":case,"schedule":schedule,"sample":sample,"passed":false,"harness_error":format!("{failure:?}")}),
                        )?;
                        writeln!(output)?;
                        output.flush()?;
                        anyhow::bail!(
                            "race setup/transport failed; inspect {}",
                            args.output.display()
                        );
                    }
                };
                serde_json::to_writer(&mut output, &record)?;
                writeln!(output)?;
                output.flush()?;
                ensure!(
                    record.passed,
                    "race invariant failed: {:?}; inspect {}",
                    record.validation_error,
                    args.output.display()
                );
                for (name, attempt) in [("a", &record.a), ("b", &record.b)] {
                    let code = attempt.error.as_ref().map_or(0, |error| error.code);
                    latency
                        .entry(format!("{case:?}/{schedule:?}/{name}/errno-{code}"))
                        .or_default()
                        .push(attempt.elapsed_us);
                }
                count += 1;
            }
        }
    }
    let groups: BTreeMap<_, _> = latency.into_iter().map(|(key, mut values)| {
        values.sort_unstable();
        let percentile = |p: f64| values[((values.len() - 1) as f64 * p).ceil() as usize];
        (key, serde_json::json!({"count":values.len(),"p50_us":percentile(0.5),"p95_us":percentile(0.95),"p99_us":percentile(0.99)}))
    }).collect();
    serde_json::to_writer(
        &mut output,
        &serde_json::json!({"summary":true,"passed":true,"cases":CASES.len(),"trials":count,"concurrent_samples_per_case":args.samples,"directory":directory.id,"latency":groups}),
    )?;
    writeln!(output)?;
    output.flush()?;
    a.call(Call::Logout).await?;
    b.call(Call::Logout).await?;
    println!(
        "{count} concurrency trials passed; {}",
        args.output.display()
    );
    Ok(())
}
