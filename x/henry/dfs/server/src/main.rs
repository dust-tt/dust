//! dfs-server: serves one tenant (one FDB key prefix) to dfs-mount sessions.

mod session;

use std::io::Write as _;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use anyhow::{Context, bail};
use clap::{Parser, Subcommand};
use dfs_core::Fs;
use dfs_core::auth::Principal;
use dfs_fdb::{FdbStore, run_with_network};
use dfs_proto::client::Client;
use dfs_proto::{Change, Kind, Op, PROTOCOL_VERSION, ROOT, Request, Response, Right};
use tokio::net::TcpListener;

use crate::session::Server;

#[derive(Parser)]
struct Cli {
    /// Tenant key prefix in FoundationDB.
    #[arg(long, env = "DFS_PREFIX", global = true, default_value = "dfs/")]
    prefix: String,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Serve mounts; prints `listening <addr>` once ready.
    Serve {
        #[arg(long, default_value = "127.0.0.1:7400")]
        listen: String,
    },
    /// Create the tenant root with `--grant principal:read|write` and print tokens as JSON.
    Provision {
        #[arg(long)]
        grant: Vec<String>,
        /// Principals that get a data token.
        #[arg(long)]
        token_for: Vec<String>,
    },
    /// Delete every key of the tenant.
    Wipe,
    /// Check the durable invariants of a quiesced tenant; exits non-zero on any violation.
    Fsck,
    /// Measure `apply` commit latency: provisions the (empty) tenant, then commits `batches`
    /// batches of `ops` file creates, each followed by a write of `file_bytes`.
    ProbeApply {
        #[arg(long, default_value_t = 10)]
        batches: usize,
        #[arg(long, default_value_t = 1000)]
        ops: usize,
        #[arg(long, default_value_t = 4096)]
        file_bytes: usize,
    },
    /// Tenant administration through a running server.
    Admin {
        #[arg(long, default_value = "127.0.0.1:7400")]
        addr: String,
        #[arg(long, env = "DFS_ADMIN_TOKEN")]
        token: String,
        #[command(subcommand)]
        op: AdminOp,
    },
}

#[derive(Subcommand)]
enum AdminOp {
    Grant {
        id: u64,
        principal: String,
        right: String,
        #[arg(long)]
        revoke: bool,
    },
    Boundary {
        id: u64,
        #[arg(long)]
        off: bool,
    },
    Members {
        group: String,
        members: Vec<String>,
    },
    Token {
        principal: String,
        #[arg(long)]
        admin: bool,
    },
}

fn right(text: &str) -> anyhow::Result<Right> {
    Ok(match text {
        "read" => Right::Read,
        "write" => Right::Write,
        "manage" => Right::Manage,
        other => bail!("unknown right {other}"),
    })
}

/// Client knobs taken from the same variables as Spolu's server, so both run matched.
fn knobs() -> Vec<(&'static str, String)> {
    [("DFS_FDB_GRV_BATCH_TIMEOUT_SECONDS", "grv_batch_timeout"), ("DFS_FDB_CLIENT_BUSY_WAIT_SECONDS", "busy_wait_threshold")]
        .into_iter()
        .filter_map(|(variable, knob)| std::env::var(variable).ok().map(|value| (knob, value)))
        .collect()
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let cluster = std::env::var("FDB_CLUSTER_FILE").unwrap_or_else(|_| "/etc/foundationdb/fdb.cluster".into());
    if let Command::Admin { addr, token, op } = cli.command {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
        return runtime.block_on(admin(&addr, token, op));
    }
    run_with_network(&knobs(), async move {
        let store = FdbStore::open(&cluster, cli.prefix.as_bytes())?;
        match cli.command {
            Command::Serve { listen } => serve(Fs::new(store), &listen).await,
            Command::Provision { grant, token_for } => {
                let fs = Fs::new(store);
                let grants = grant
                    .iter()
                    .map(|g| {
                        let (principal, r) = g.split_once(':').context("--grant principal:right")?;
                        Ok((principal.to_string(), right(r)?))
                    })
                    .collect::<anyhow::Result<Vec<_>>>()?;
                let admin = fs.provision(grants, "admin").await.map_err(|e| anyhow::anyhow!("provision: {e:?}"))?;
                let caller = dfs_core::Caller {
                    principal: Principal { name: "admin".into(), admin: true },
                    session: 0,
                    seq: rand_seq(),
                    resent: false,
                };
                let mut tokens = serde_json::Map::new();
                for (i, principal) in token_for.iter().enumerate() {
                    let caller = dfs_core::Caller { seq: caller.seq + i as u64, ..caller.clone() };
                    let response = fs.create_token(&caller, principal, false).await.map_err(|e| anyhow::anyhow!("token: {e:?}"))?;
                    if let Response::Token(token) = response {
                        tokens.insert(principal.clone(), token.into());
                    }
                }
                println!("{}", serde_json::json!({ "admin": admin, "tokens": tokens }));
                Ok(())
            }
            Command::Wipe => store.wipe().await,
            Command::Fsck => {
                let problems = Fs::new(store).fsck().await.map_err(|e| anyhow::anyhow!("fsck: {e:?}"))?;
                for problem in &problems {
                    println!("{problem}");
                }
                println!("fsck: {} problem(s)", problems.len());
                if problems.is_empty() { Ok(()) } else { bail!("inconsistent") }
            }
            Command::ProbeApply { batches, ops, file_bytes } => probe_apply(Fs::new(store), batches, ops, file_bytes).await,
            Command::Admin { .. } => Ok(()),
        }
    })
}

fn rand_seq() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos() as u64)
}

async fn serve(fs: Fs<FdbStore>, listen: &str) -> anyhow::Result<()> {
    let server = Arc::new(Server::new(fs));
    let listener = TcpListener::bind(listen).await?;
    println!("listening {}", listener.local_addr()?);
    std::io::stdout().flush()?;
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, _) = accepted?;
                let server = server.clone();
                tokio::spawn(async move {
                    if let Err(error) = server.serve(stream).await {
                        eprintln!("connection: {error:#}");
                    }
                });
            }
            _ = terminate.recv() => break,
            _ = tokio::signal::ctrl_c() => break,
        }
    }
    let stats = server.fs.stats();
    let calls: serde_json::Map<String, serde_json::Value> = server
        .calls
        .lock()
        .iter()
        .map(|(name, (count, micros))| (name.to_string(), serde_json::json!({ "calls": count, "total_ms": *micros as f64 / 1000.0 })))
        .collect();
    eprintln!(
        "{}",
        serde_json::json!({
            "message": "server totals",
            "commits": stats.commits.load(Ordering::Relaxed),
            "retries": stats.retries.load(Ordering::Relaxed),
            "fresh_versions": stats.fresh_versions.load(Ordering::Relaxed),
            "ops": stats.ops.load(Ordering::Relaxed),
            "failed_ops": stats.failed_ops.load(Ordering::Relaxed),
            "calls": calls,
        })
    );
    Ok(())
}

async fn admin(addr: &str, token: String, op: AdminOp) -> anyhow::Result<()> {
    let client = Client::connect(addr).await?;
    let hello = client.call(Request::Hello { version: PROTOCOL_VERSION, token, root: None }).await;
    hello.result.map_err(|e| anyhow::anyhow!("hello: {e:?}"))?;
    let request = match op {
        AdminOp::Grant { id, principal, right: r, revoke } => Request::Grant { id, principal, right: right(&r)?, granted: !revoke },
        AdminOp::Boundary { id, off } => Request::SetBoundary { id, boundary: !off },
        AdminOp::Members { group, members } => Request::SetMembers { group, members },
        AdminOp::Token { principal, admin } => Request::CreateToken { principal, admin },
    };
    match client.call(request).await.result {
        Ok(Response::Token(token)) => println!("{token}"),
        Ok(_) => println!("ok"),
        Err(errno) => bail!("failed: errno {}", errno.0),
    }
    client.call(Request::Close).await;
    Ok(())
}

async fn probe_apply(fs: Fs<FdbStore>, batches: usize, ops: usize, file_bytes: usize) -> anyhow::Result<()> {
    let failed = |e| anyhow::anyhow!("probe: {e:?}");
    fs.provision(vec![("probe".into(), Right::Write)], "admin").await.map_err(failed)?;
    let principal = Principal { name: "probe".into(), admin: false };
    let session = rand_seq() as u128;
    let data = vec![7u8; file_bytes];
    let mut ids = Vec::new();
    let mut latencies = Vec::new();
    for batch in 0..batches {
        let mut list = Vec::with_capacity(ops * 2);
        for i in 0..ops {
            if ids.is_empty() {
                let (first, count) = fs.alloc_ids(&principal).await.map_err(failed)?;
                ids.extend((first..first + count as u64).rev());
            }
            let id = ids.pop().context("ids")?;
            list.push(Op::Create { parent: ROOT, name: format!("b{batch}-{i}"), id, kind: Kind::File, mode: 0o644, mtime_ns: 1, target: None });
            list.push(Op::Write { id, changes: vec![Change::Write { offset: 0, bytes: data.clone() }], mtime_ns: None });
        }
        let caller = dfs_core::Caller { principal: principal.clone(), session, seq: batch as u64 + 1, resent: false };
        let started = std::time::Instant::now();
        let response = fs.apply(&caller, &list).await.map_err(failed)?;
        latencies.push(started.elapsed().as_secs_f64() * 1000.0);
        if let Response::Applied { results, .. } = response {
            anyhow::ensure!(results.iter().all(Option::is_none), "failed ops: {results:?}");
        }
    }
    latencies.sort_by(f64::total_cmp);
    println!(
        "{}",
        serde_json::json!({
            "batches": batches, "ops": ops * 2, "data_bytes": ops * file_bytes,
            "p50_ms": latencies[latencies.len() / 2], "max_ms": latencies[latencies.len() - 1], "all_ms": latencies,
        })
    );
    Ok(())
}
