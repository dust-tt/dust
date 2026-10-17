use std::{sync::atomic::Ordering, time::Instant};

use anyhow::{Context, Result, ensure};
use clap::Parser;
use dfs_protocol::{ObjectId, rpc::*};
use futures::future::try_join_all;

mod client;
mod model;
mod scenarios;

use client::{Client, allow};

const DEFAULT_STEPS: usize = 250;
const DEFAULT_WORKERS: usize = 4;
const MAX_WORKERS: usize = 32;

#[derive(Parser)]
#[command(about = "Check a running DFS server against deterministic workloads over gRPC")]
struct Config {
    #[arg(long, env = "DFS_API_URL", default_value = "http://127.0.0.1:50051")]
    endpoint: String,
    #[arg(long, env = "DFS_MASTER_KEY", hide_env_values = true)]
    master_key: String,
    #[arg(long, default_value_t = 1)]
    seed: u64,
    #[arg(long, default_value_t = DEFAULT_STEPS)]
    steps: usize,
    #[arg(long, default_value_t = DEFAULT_WORKERS)]
    workers: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_target(false)
        .without_time()
        .init();
    let config = Config::parse();
    ensure!(
        config.workers > 0 && config.workers <= MAX_WORKERS,
        "workers must be in 1..={MAX_WORKERS}"
    );
    ensure!(config.steps > 0, "steps must be positive");
    let start = Instant::now();
    let mut master = Client::connect(&config.endpoint, &config.master_key).await?;
    let tenant_id = format!("workload-{}", ObjectId::new_v7());
    tracing::info!(seed = config.seed, workers = config.workers, steps = config.steps, %tenant_id, endpoint = %config.endpoint, "starting DFS workload");
    let request = master.request(CreateTenantRequest {
        tenant_id: tenant_id.clone(),
        root_grants: vec![allow("owner", 0o6)],
    });
    let tenant = master.api.create_tenant(request).await?.into_inner();
    let mut admin = master.with_key(&tenant.tenant_key)?;
    let (mut owner, session) = admin.session(vec!["owner".into()]).await?;

    scenarios::run(&mut master, &mut admin, owner.clone(), &tenant)
        .await
        .with_context(|| {
            format!(
                "scenario checks failed; seed={}, tenant={tenant_id}",
                config.seed
            )
        })?;
    tracing::info!(
        "fixed scenarios passed: grants, shared aliases, errors, sessions, concurrent appends and moves"
    );

    let workers = (0..config.workers).map(|worker| {
        model::run(
            owner.clone(),
            tenant.root_id,
            config.seed.wrapping_add(worker as u64),
            config.steps,
            worker,
        )
    });
    try_join_all(workers).await.with_context(|| {
        format!(
            "model workload failed; seed={}, tenant={tenant_id}",
            config.seed
        )
    })?;
    ensure!(
        owner.list(tenant.root_id.into()).await?.is_empty(),
        "workload objects not cleaned up"
    );
    let request = admin.request(RevokeSessionRequest {
        session_id: session.id,
    });
    admin.api.revoke_session(request).await?;
    tracing::info!(seed = config.seed, workers = config.workers, checked_steps = config.steps * config.workers, rpc_count = master.calls.load(Ordering::Relaxed), elapsed_ms = start.elapsed().as_millis(), %tenant_id, "PASS: all workload checks passed");
    Ok(())
}
