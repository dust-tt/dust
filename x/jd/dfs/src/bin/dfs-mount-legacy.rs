#[cfg(target_os = "linux")]
mod linux {
    use clap::Parser;
    use dfs_poc::{
        cache::{Cache, NamespaceLimits},
        client::Client,
        model::*,
        mount::{
            InvalidationBarrier, Mount, MountConfig, invalidate_cached_nodes,
            retire_writeback_versions,
        },
        reader::ReadLimits,
        rpc::{decode, encode},
    };
    use parking_lot::{Mutex, RwLock};
    use std::{
        path::PathBuf,
        sync::{Arc, atomic::Ordering},
        time::{Duration, Instant},
    };

    #[derive(Parser)]
    pub struct Args {
        #[arg(long, default_value = "http://127.0.0.1:7443")]
        endpoint: String,
        #[arg(long)]
        token_file: PathBuf,
        #[arg(long)]
        mountpoint: PathBuf,
        #[arg(long)]
        ca: Option<PathBuf>,
        #[arg(long, default_value_t = 4 << 20)]
        cache_bytes: usize,
        #[arg(long, default_value_t = 100_000)]
        metadata_nodes: usize,
        #[arg(long, default_value_t = 128 << 20)]
        metadata_bytes: usize,
        #[arg(long, default_value_t = 0)]
        prefetch_bytes: usize,
        #[arg(long, default_value_t = 256 << 10)]
        read_ahead_bytes: usize,
        #[arg(long)]
        direct_io: bool,
        #[arg(long)]
        daemon_prefetch: bool,
        #[arg(long)]
        experimental_kernel_writeback: bool,
        #[arg(long, default_value_t = 128)]
        writeback_capacity: usize,
        #[arg(long, default_value_t = MAX_IO_BYTES)]
        read_rpc_bytes: usize,
        #[arg(long, default_value_t = 4)]
        read_concurrency: usize,
        #[arg(long, default_value_t = 8 * MAX_IO_BYTES)]
        read_inflight_bytes: usize,
        #[arg(long, default_value_t = 8 * MAX_IO_BYTES)]
        read_reply_bytes: usize,
        #[arg(long, default_value_t = MAX_IO_BYTES)]
        speculative_bytes: usize,
        #[arg(long, default_value_t = 128)]
        pending_reads: usize,
        #[arg(long, default_value_t = 32 << 20)]
        directory_snapshot_bytes: usize,
        #[arg(long)]
        publication_only_sync: bool,
        #[arg(long, conflicts_with = "publication_only_sync")]
        durable_sync: bool,
        #[arg(long, default_value_t = 100_000)]
        publication_capacity: usize,
        #[arg(long, default_value_t = 200_000)]
        inode_capacity: usize,
        #[arg(long, default_value_t = 1000)]
        reconcile_ms: u64,
        #[arg(long)]
        drop_events: bool,
        #[arg(long)]
        uid: Option<u32>,
        #[arg(long)]
        gid: Option<u32>,
        #[arg(long)]
        allow_other: bool,
        #[arg(long)]
        metrics_file: Option<PathBuf>,
    }
    pub async fn run() -> anyhow::Result<()> {
        tracing_subscriber::fmt()
            .json()
            .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
            .init();
        let args = Args::parse();
        let publication_only_sync = args.publication_only_sync || !args.durable_sync;
        anyhow::ensure!(
            args.reconcile_ms > 0,
            "positive reconciliation interval required"
        );
        let token = std::fs::read_to_string(&args.token_file)?.trim().to_owned();
        let ca = args.ca.as_ref().map(std::fs::read).transpose()?;
        let started = Instant::now();
        let initial = Client::connect(&args.endpoint, &token, ca.clone()).await?;
        let metadata_limits = NamespaceLimits {
            nodes: args.metadata_nodes,
            bytes: args.metadata_bytes,
        };
        let view = initial
            .view_with_limits(metadata_limits.nodes, metadata_limits.bytes)
            .await?;
        let mut cache = Cache::with_limits(view, args.cache_bytes, metadata_limits)?;
        cache.prefetch(&initial, args.prefetch_bytes).await?;
        tracing::info!(
            preparation_ms = started.elapsed().as_millis() as u64,
            nodes = cache.namespace.nodes.len(),
            cache_bytes = cache.content.bytes,
            rpc_count = initial.counters.calls.load(Ordering::Relaxed),
            received_bytes = initial.counters.received_bytes.load(Ordering::Relaxed),
            "mount prepared"
        );
        let cache = Arc::new(Mutex::new(cache));
        let client = Arc::new(RwLock::new(initial));
        let mount = Mount::new(
            cache.clone(),
            client.clone(),
            tokio::runtime::Handle::current(),
            MountConfig {
                uid: args.uid.unwrap_or_else(|| unsafe { libc::getuid() }),
                gid: args.gid.unwrap_or_else(|| unsafe { libc::getgid() }),
                read_ahead_bytes: args.read_ahead_bytes,
                direct_io: args.direct_io,
                kernel_prefetch: !args.daemon_prefetch,
                experimental_kernel_writeback: args.experimental_kernel_writeback,
                writeback_capacity: args.writeback_capacity,
                directory_snapshot_bytes: args.directory_snapshot_bytes,
                publication_only_sync,
                publication_capacity: args.publication_capacity,
                inode_capacity: args.inode_capacity,
                read_limits: ReadLimits {
                    rpc_bytes: args.read_rpc_bytes,
                    demand_concurrency: args.read_concurrency,
                    demand_inflight_bytes: args.read_inflight_bytes,
                    reply_bytes: args.read_reply_bytes,
                    speculative_bytes: args.speculative_bytes,
                    pending_requests: args.pending_reads,
                },
            },
        )?;
        let kernel_notifier = mount.notifier.clone();
        let notification_failure = mount.notification_failure.clone();
        let gate = mount.gate.clone();
        let transition = mount.transition.clone();
        let invalidating = mount.invalidating.clone();
        let inodes = mount.inodes.clone();
        let metrics_inodes = inodes.clone();
        let operations = mount.operations.clone();
        let reads = mount.reader.counters.clone();
        let reader = mount.reader.clone();
        let mut options = vec![
            fuser::MountOption::FSName("dfs".into()),
            fuser::MountOption::NoAtime,
            fuser::MountOption::DefaultPermissions,
        ];
        if args.allow_other {
            options.push(fuser::MountOption::AllowOther);
        }
        let session = fuser::spawn_mount2(mount.into_driver(), &args.mountpoint, &options)?;
        let notifier = session.notifier();
        *kernel_notifier.write() = Some(notifier.clone());
        let refresh_cache = cache.clone();
        let refresh_client = client.clone();
        let mut refresh = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(args.reconcile_ms));
            let mut stream = None;
            loop {
                let current = refresh_client.read().clone();
                if let Some(path) = &args.metrics_file {
                    let counters = current.counters.snapshot();
                    let cache = refresh_cache.lock();
                    let sample = serde_json::json!({"time_ms": now_ms(), "counters": counters, "fuse_operations": operations.snapshot(), "reads": reads.snapshot(), "kernel_prefetch": reader.kernel_snapshot(), "cache_bytes": cache.content.bytes, "daemon_cache_budget_bytes": args.cache_bytes, "read_rpc_bytes": args.read_rpc_bytes, "read_concurrency": args.read_concurrency, "read_inflight_bytes": args.read_inflight_bytes, "read_reply_bytes": args.read_reply_bytes, "read_response_charge_multiplier": 2, "speculative_limit_bytes": args.speculative_bytes, "pending_read_limit": args.pending_reads, "directory_snapshot_limit_bytes": args.directory_snapshot_bytes, "kernel_content_cache": !args.direct_io, "publication_only_sync": publication_only_sync, "experimental_kernel_writeback": args.experimental_kernel_writeback, "writeback_inode_limit": args.writeback_capacity, "speculative_cache_bytes": cache.content.speculative_bytes, "prefetch_used_bytes": cache.content.prefetch_used_bytes, "prefetch_evicted_bytes": cache.content.prefetch_evicted_bytes, "evicted_bytes": cache.content.evicted_bytes, "inodes": metrics_inodes.snapshot(), "nodes": cache.namespace.nodes.len(), "namespace_charged_bytes": cache.namespace.bytes, "namespace_byte_limit": metadata_limits.bytes, "namespace_node_limit": metadata_limits.nodes, "head": cache.namespace.head});
                    let temporary = path.with_extension("tmp");
                    std::fs::write(&temporary, serde_json::to_vec(&sample)?)?;
                    std::fs::rename(temporary, path)?;
                }
                if stream.is_none() && !args.drop_events {
                    stream = tokio::time::timeout(
                        Duration::from_secs(5),
                        current.rpc.clone().watch(encode(&current.session.id)?),
                    )
                    .await
                    .ok()
                    .and_then(|result| result.ok())
                    .map(|r| r.into_inner());
                }
                let notification = if let Some(watch) = &mut stream {
                    tokio::select! {
                        _ = interval.tick() => None,
                        message = watch.message() => match message { Ok(Some(frame)) => Some(decode::<Result<Reply>>(frame)?), _ => { stream = None; None } },
                    }
                } else {
                    interval.tick().await;
                    None
                };
                let head = match notification {
                    Some(result) => result,
                    None => current.call(Call::Head).await,
                };
                match head {
                    Ok(Reply::Head {
                        head, incarnation, ..
                    }) => {
                        let stale = {
                            let cache = refresh_cache.lock();
                            cache.namespace.head != head
                                || cache.namespace.incarnation != incarnation
                        };
                        if stale {
                            let transition_guard = transition.lock().await;
                            let invalidation = InvalidationBarrier::new(invalidating.clone());
                            let gate = gate.clone();
                            let cache = refresh_cache.clone();
                            let retained_inodes = inodes.clone();
                            let runtime = tokio::runtime::Handle::current();
                            let result = tokio::task::spawn_blocking(move || {
                                let _guard = gate.lock();
                                let cursor = {
                                    let cache = cache.lock();
                                    Cursor {
                                        incarnation: cache.namespace.incarnation.clone(),
                                        head: cache.namespace.head,
                                    }
                                };
                                let Reply::Delta(delta) =
                                    runtime.block_on(current.call(Call::Changes { cursor }))?
                                else {
                                    return Err(err(libc::EIO, "delta reply"));
                                };
                                if delta.reset {
                                    let view = runtime.block_on(current.view_with_limits(
                                        metadata_limits.nodes,
                                        metadata_limits.bytes,
                                    ))?;
                                    let mut cache = cache.lock();
                                    let reset = cache.namespace.incarnation != view.incarnation;
                                    let changed = cache.replace(view)?;
                                    let removed = retained_inodes
                                        .active_ids()
                                        .into_iter()
                                        .filter(|id| !cache.namespace.nodes.contains_key(id))
                                        .collect();
                                    let retired = if args.experimental_kernel_writeback {
                                        retire_writeback_versions(&retained_inodes, &changed)
                                    } else {
                                        Vec::new()
                                    };
                                    Result::<_>::Ok((changed, removed, reset, retired))
                                } else {
                                    let mut cache = cache.lock();
                                    let mut changed: Vec<_> = delta
                                        .removed
                                        .iter()
                                        .filter_map(|id| cache.namespace.nodes.get(id).cloned())
                                        .collect();
                                    for item in &delta.upserts {
                                        let previous = cache.namespace.nodes.get(&item.node.id);
                                        if previous == Some(item) {
                                            continue;
                                        }
                                        changed.extend(previous.cloned());
                                        changed.push(item.clone());
                                    }
                                    let removed = delta.removed.clone();
                                    cache.namespace.apply_delta(delta)?;
                                    let retired = if args.experimental_kernel_writeback {
                                        retire_writeback_versions(&retained_inodes, &changed)
                                    } else {
                                        Vec::new()
                                    };
                                    Result::<_>::Ok((changed, removed, false, retired))
                                }
                            })
                            .await?;
                            drop(transition_guard);
                            match result {
                                Ok((changed, removed, reset, retired)) => {
                                    let notifier = notifier.clone();
                                    let inodes = inodes.clone();
                                    tokio::task::spawn_blocking(move || {
                                        invalidate_cached_nodes(
                                            &notifier, &inodes, changed, removed, reset, retired,
                                        )
                                    })
                                    .await??;
                                }
                                Err(error) if error.code == libc::EOVERFLOW => {
                                    return Err(error.into());
                                }
                                Err(error) => {
                                    tracing::warn!(code = error.code, "view refresh failed")
                                }
                            }
                            invalidation.complete();
                        }
                    }
                    Err(error) if error.code == libc::ESTALE => {
                        match Client::connect(&args.endpoint, &token, ca.clone()).await {
                            Ok(mut new_client) => {
                                new_client.counters = current.counters.clone();
                                let view = new_client
                                    .view_with_limits(metadata_limits.nodes, metadata_limits.bytes)
                                    .await?;
                                let transition_guard = transition.lock().await;
                                let invalidation = InvalidationBarrier::new(invalidating.clone());
                                let reset_gate = gate.clone();
                                let reset_cache = refresh_cache.clone();
                                let reset_inodes = inodes.clone();
                                let reset_client = refresh_client.clone();
                                let changed =
                                    tokio::task::spawn_blocking(move || {
                                        let _guard = reset_gate.lock();
                                        let mut cache = reset_cache.lock();
                                        let mut changed: Vec<_> =
                                            cache.namespace.nodes.values().cloned().collect();
                                        changed.extend(view.nodes.iter().cloned());
                                        reset_inodes.retain_active(|id| {
                                            cache.namespace.nodes.get(id).is_some_and(|item| {
                                                item.node.kind == Kind::Directory
                                            })
                                        });
                                        cache.replace(view)?;
                                        *reset_client.write() = new_client;
                                        Result::<Vec<ViewNode>>::Ok(changed)
                                    })
                                    .await??;
                                drop(transition_guard);
                                let notifier = notifier.clone();
                                let inodes = inodes.clone();
                                tokio::task::spawn_blocking(move || {
                                    invalidate_cached_nodes(
                                        &notifier,
                                        &inodes,
                                        changed,
                                        Vec::new(),
                                        true,
                                        Vec::new(),
                                    )
                                })
                                .await??;
                                invalidation.complete();
                                stream = None;
                                tracing::info!("view reset after incarnation change");
                            }
                            Err(_) => tracing::warn!("reauthentication failed"),
                        }
                    }
                    Err(error) if error.code == libc::EACCES => {
                        let transition_guard = transition.lock().await;
                        let invalidation = InvalidationBarrier::new(invalidating.clone());
                        let reset_gate = gate.clone();
                        let reset_cache = refresh_cache.clone();
                        let changed = tokio::task::spawn_blocking(move || {
                            let _guard = reset_gate.lock();
                            let mut cache = reset_cache.lock();
                            let changed: Vec<_> = cache.namespace.nodes.values().cloned().collect();
                            let view = View {
                                incarnation: cache.namespace.incarnation.clone(),
                                head: cache.namespace.head,
                                auth_generation: cache.namespace.auth_generation + 1,
                                nodes: Vec::new(),
                            };
                            cache.replace(view)?;
                            Result::<Vec<ViewNode>>::Ok(changed)
                        })
                        .await??;
                        drop(transition_guard);
                        let notifier = notifier.clone();
                        let inodes = inodes.clone();
                        tokio::task::spawn_blocking(move || {
                            invalidate_cached_nodes(
                                &notifier,
                                &inodes,
                                changed,
                                Vec::new(),
                                true,
                                Vec::new(),
                            )
                        })
                        .await??;
                        invalidation.complete();
                        tracing::warn!("session access lost");
                        break;
                    }
                    Err(error) => {
                        stream = None;
                        tracing::warn!(code = error.code, "reconciliation unavailable");
                    }
                    _ => {}
                }
            }
            anyhow::Result::<()>::Ok(())
        });
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        let refresh_result = tokio::select! {
            _ = tokio::signal::ctrl_c() => Ok(()),
            _ = terminate.recv() => Ok(()),
            _ = notification_failure.notified() => Err(anyhow::anyhow!("kernel recovery invalidation failed")),
            result = &mut refresh => result.map_err(anyhow::Error::from).and_then(|r| r),
        };
        refresh.abort();
        let current = client.read().clone();
        tracing::info!(
            rpc_count = current.counters.calls.load(Ordering::Relaxed),
            sent_bytes = current.counters.sent_bytes.load(Ordering::Relaxed),
            received_bytes = current.counters.received_bytes.load(Ordering::Relaxed),
            cache_bytes = cache.lock().content.bytes,
            "mount stopping"
        );
        let unmounted = tokio::process::Command::new("/bin/fusermount3")
            .args(["-uz", "--"])
            .arg(&args.mountpoint)
            .status()
            .await?;
        drop(session);
        anyhow::ensure!(unmounted.success(), "mount detach failed");
        let _ = current.call(Call::Logout).await;
        refresh_result
    }
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    #[cfg(target_os = "linux")]
    {
        linux::run().await
    }
    #[cfg(not(target_os = "linux"))]
    {
        anyhow::bail!("dfs-mount requires Linux FUSE")
    }
}
