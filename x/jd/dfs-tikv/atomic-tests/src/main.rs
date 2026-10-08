use anyhow::{Context, ensure};
use dfs_tikv::store::Backend;
use dfs_tikv::{Commit, Config, Store};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const TENANT: &str = "atomic-tenant";
const KEYS: [&[u8]; 3] = [b"a-generation", b"m-directory", b"z-receipt"];

fn config(namespace: &str) -> anyhow::Result<Config> {
    let endpoints: Vec<_> = std::env::var("DFS_ATOMIC_PD")?
        .split(',')
        .map(str::to_owned)
        .collect();
    ensure!(
        endpoints.iter().all(|p| p.ends_with(":2479")),
        "isolated cluster ports required"
    );
    let mut config = Config::new(endpoints, namespace.to_owned());
    config.backend = Backend::Txnkv;
    Ok(config)
}

async fn publish(store: &Store, generation: u64) -> anyhow::Result<()> {
    let mut batch = store.snapshot(TENANT).await?.batch();
    for key in KEYS {
        batch.put(key, &generation.to_be_bytes()).await?;
    }
    ensure!(
        matches!(batch.commit().await?, Commit::Published { .. }),
        "unexpected conflict"
    );
    Ok(())
}

async fn observe(store: &Store) -> anyhow::Result<u64> {
    let snapshot = store.snapshot(TENANT).await?;
    let mut values = Vec::new();
    for key in KEYS {
        values.push(snapshot.get(key).await?.context("missing atomic record")?);
        tokio::task::yield_now().await;
    }
    ensure!(
        values.windows(2).all(|v| v[0] == v[1]),
        "partial transaction: {values:?}"
    );
    Ok(u64::from_be_bytes(values[0].as_slice().try_into()?))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn region_key(namespace: &str, key: &[u8]) -> String {
    let tenant = hex(&Sha256::digest(TENANT.as_bytes()));
    let raw = [format!("dfs-txn-v1/{namespace}/{tenant}/").as_bytes(), key].concat();
    let mut result = Vec::new();
    let mut offset = 0;
    loop {
        let count = (raw.len() - offset).min(8);
        result.extend_from_slice(&raw[offset..offset + count]);
        result.resize(result.len() + 8 - count, 0);
        result.push(255 - (8 - count) as u8);
        if count < 8 {
            break;
        }
        offset += 8;
    }
    hex(&result)
}

async fn separate_regions(namespace: &str) -> anyhow::Result<Vec<Value>> {
    let endpoint = config(namespace)?.pd_endpoints[0].clone();
    let base = format!("http://{endpoint}/pd/api/v1");
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let keys: Vec<_> = KEYS.iter().map(|key| region_key(namespace, key)).collect();
    let response = http
        .post(format!("{base}/regions/split"))
        .json(&json!({"split_keys":&keys[1..],"retry_limit":5}))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    let started = Instant::now();
    loop {
        let mut regions = Vec::new();
        for key in &keys {
            regions.push(
                http.get(format!("{base}/region/key/{key}?format=hex"))
                    .send()
                    .await?
                    .error_for_status()?
                    .json::<Value>()
                    .await?,
            );
        }
        let ids: BTreeSet<_> = regions.iter().filter_map(|r| r["id"].as_u64()).collect();
        if ids.len() == KEYS.len() {
            return Ok(regions);
        }
        ensure!(
            started.elapsed() < Duration::from_secs(30),
            "split did not separate records: {response}"
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

struct Writer(Child);
impl Drop for Writer {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

async fn child(phase: &str, namespace: &str, marker: PathBuf) -> anyhow::Result<()> {
    let _scenario = fail::FailScenario::setup();
    let store = Store::connect(config(namespace)?).await?;
    let captured = marker.clone();
    fail::cfg_callback(phase, move || {
        std::fs::write(&captured, "reached").expect("phase marker");
        loop {
            std::thread::park_timeout(Duration::from_secs(60));
        }
    })
    .map_err(anyhow::Error::msg)?;
    publish(&store, 1).await?;
    std::fs::write(marker.with_extension("acknowledged"), "committed")?;
    std::future::pending::<()>().await;
    Ok(())
}

async fn crash_case(output: &Path, phase: &str, expected: u64) -> anyhow::Result<Value> {
    let namespace = format!("atomic-{}", uuid::Uuid::new_v4().simple());
    let store = Store::connect(config(&namespace)?).await?;
    publish(&store, 0).await?;
    let regions = separate_regions(&namespace).await?;
    let marker = output.join(format!("{phase}.marker"));
    ensure!(!marker.exists(), "phase marker must be new");
    let log = std::fs::File::create(output.join(format!("{phase}.log")))?;
    let mut writer = Writer(
        Command::new(std::env::current_exe()?)
            .args(["child", phase, &namespace])
            .arg(&marker)
            .stdin(Stdio::null())
            .stdout(log.try_clone()?)
            .stderr(log)
            .spawn()?,
    );
    let started = Instant::now();
    while !marker.exists() {
        ensure!(
            writer.0.try_wait()?.is_none(),
            "writer exited before failpoint"
        );
        ensure!(
            started.elapsed() < Duration::from_secs(30),
            "failpoint not reached"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let reached_ms = started.elapsed().as_millis();
    writer.0.kill()?;
    let status = writer.0.wait()?;
    ensure!(!status.success(), "writer was not killed");
    let fresh = Store::connect(config(&namespace)?).await?;
    let recovery = Instant::now();
    let observed = observe(&fresh).await?;
    ensure!(
        observed == expected,
        "wrong recovered generation: {observed} expected {expected}"
    );
    let recovery_ms = recovery.elapsed().as_millis();
    publish(&fresh, 2).await?;
    ensure!(
        observe(&Store::connect(config(&namespace)?).await?).await? == 2,
        "recovered keys not writable"
    );
    Ok(
        json!({"phase":phase,"passed":true,"namespace":namespace,"region_ids":regions.iter().map(|r| &r["id"]).collect::<Vec<_>>(),"regions":regions,"failpoint_reached_ms":reached_ms,"recovery_ms":recovery_ms,"observed_generation":observed,"expected_generation":expected,"fresh_client_write_verified":true,"writer_status":status.to_string()}),
    )
}

async fn concurrent_snapshots() -> anyhow::Result<Value> {
    let namespace = format!("atomic-{}", uuid::Uuid::new_v4().simple());
    let writer = Store::connect(config(&namespace)?).await?;
    publish(&writer, 0).await?;
    let regions = separate_regions(&namespace).await?;
    let stop = Arc::new(AtomicBool::new(false));
    let reader = Store::connect(config(&namespace)?).await?;
    let finished = stop.clone();
    let task = tokio::spawn(async move {
        let mut observations = 0;
        let mut generations = BTreeSet::new();
        while !finished.load(Ordering::Acquire) {
            generations.insert(observe(&reader).await?);
            observations += 1;
        }
        Ok::<_, anyhow::Error>((observations, generations))
    });
    for generation in 1..=100 {
        publish(&writer, generation).await?;
    }
    stop.store(true, Ordering::Release);
    let (observations, generations) = task.await??;
    ensure!(
        observations > 10 && generations.len() > 2,
        "reader did not observe overlapping generations"
    );
    ensure!(observe(&writer).await? == 100, "final generation absent");
    Ok(
        json!({"passed":true,"namespace":namespace,"publications":100,"observations":observations,"observed_generations":generations,"regions":regions}),
    )
}

#[tokio::main(flavor = "multi_thread", worker_threads = 4)]
async fn main() -> anyhow::Result<()> {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).is_some_and(|v| v == "child") {
        ensure!(args.len() == 5, "child arguments");
        return child(&args[2], &args[3], PathBuf::from(&args[4])).await;
    }
    let output = PathBuf::from(args.get(1).context("output directory required")?);
    std::fs::create_dir_all(&output)?;
    let mut cases = Vec::new();
    for (phase, expected) in [("after-prewrite", 0), ("before-commit-secondary", 1)] {
        let value = crash_case(&output, phase, expected).await?;
        std::fs::write(
            output.join(format!("{phase}.json")),
            serde_json::to_vec_pretty(&value)?,
        )?;
        println!("{value}");
        cases.push(value);
    }
    let concurrent = concurrent_snapshots().await?;
    let value = json!({"passed":true,"scope":"independent processes and clients, three TiKV Regions, unchanged DFS store with test-only upstream client failpoints","crash_cases":cases,"concurrent_snapshots":concurrent});
    std::fs::write(
        output.join("atomicity.json"),
        serde_json::to_vec_pretty(&value)?,
    )?;
    println!("{value}");
    Ok(())
}
