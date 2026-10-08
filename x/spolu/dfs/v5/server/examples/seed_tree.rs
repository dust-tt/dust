//! Offline, resumable population of complete v5 objects for durable tree scale measurements.
use anyhow::{Context, Result, ensure};
use clap::Parser;
use dfs_core::{
    grants,
    keys::{Keys, prefix_end},
    model::{self, Extended, Parent, Record, TenantRecord},
    mutation::Edit,
    storage::{WriteBatch, decode, encode},
    tree::GrantId,
    tree_log::{self, Node, Stamp},
};
use dfs_protocol::{
    ObjectId, ObjectRef,
    credentials::write_private,
    error::status,
    rpc::{ErrorCode, Tenant},
};
use dfs_server_v5::storage::{Storage, StorageConfig};
use futures::{StreamExt, TryStreamExt, stream};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};
use tonic::Status;

#[derive(Parser)]
struct Config {
    #[command(flatten)]
    storage: StorageConfig,
    #[arg(long)]
    tenant: String,
    #[arg(long)]
    files: u64,
    #[arg(long)]
    manifest: PathBuf,
    #[arg(long, default_value_t = 16)]
    workers: u32,
    /// Concurrent transactions, independent of the durable worker partition count.
    #[arg(long, default_value_t = 8)]
    concurrency: usize,
    #[arg(long, default_value_t = 256)]
    batch: u64,
    /// Repair legacy fixture child references offline, without populating more objects.
    #[arg(long)]
    repair_child_index: bool,
}
#[derive(Serialize, Deserialize)]
struct Manifest {
    tenant: Tenant,
    seed: [u8; 16],
    prefix: String,
    files: u64,
    directories: u64,
    workers: u32,
    batch: u64,
}
impl Manifest {
    fn id(&self, directory: bool, index: u64) -> Result<ObjectRef, Status> {
        if directory && index == 0 {
            return Ok(self.tenant.root_id);
        }
        let mut hash = Sha256::new();
        hash.update(self.seed);
        hash.update([u8::from(directory)]);
        hash.update(index.to_be_bytes());
        let mut bytes = [0; 16];
        bytes.copy_from_slice(&hash.finalize()[..16]);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        Ok(ObjectRef::Object(
            ObjectId::from_bytes(bytes).map_err(|_| status(ErrorCode::Internal))?,
        ))
    }
    fn parent(&self, directory: bool, index: u64) -> Result<u64, Status> {
        if directory {
            Ok(if index <= 16 { 0 } else { 1 + (index - 17) / 4 })
        } else {
            let bytes = self
                .id(false, index)?
                .real()
                .map_err(|_| status(ErrorCode::Internal))?;
            let mut value = [0; 8];
            value.copy_from_slice(&bytes.as_bytes()[..8]);
            Ok(1 + u64::from_be_bytes(value) % self.directories)
        }
    }
    fn cursor(&self, kind: u8, worker: u32) -> Vec<u8> {
        let mut key = vec![3];
        key.extend_from_slice(&(self.tenant.tenant_id.len() as u32).to_be_bytes());
        key.extend_from_slice(self.tenant.tenant_id.as_bytes());
        key.push(kind);
        key.extend_from_slice(&worker.to_be_bytes());
        key
    }
}
fn data(index: u64) -> Vec<u8> {
    let text = format!(
        "Fixture document {index}: engineering project notes, permissions and filesystem search.\n"
    );
    let length = if index.is_multiple_of(1000) {
        4096
    } else {
        128
    };
    text.as_bytes()
        .iter()
        .copied()
        .cycle()
        .take(length)
        .collect()
}
fn attached(directory: bool, index: u64) -> bool {
    if directory {
        index % 16 == 1
    } else {
        index % 1000 == 7
    }
}
fn names() -> BTreeSet<String> {
    std::iter::once("owner".into())
        .chain((0..64).map(|i| format!("team-{i:02}")))
        .collect()
}

async fn initialize(
    storage: &Storage,
    manifest: &Manifest,
) -> Result<BTreeMap<String, GrantId>, Status> {
    let keys = Keys::new(&manifest.tenant.tenant_id)?;
    let fingerprint = Sha256::digest(encode(manifest)?).to_vec();
    storage
        .transact(|snapshot| {
            let keys = &keys;
            let fingerprint = &fingerprint;
            async move {
                let existing = snapshot.get(keys.tenant()).await?;
                if existing.is_some() {
                    if snapshot.get(manifest.cursor(0, 0)).await?.as_deref()
                        != Some(fingerprint.as_slice())
                    {
                        return Err(status(ErrorCode::AlreadyExists));
                    }
                    let ids = grants::intern(&snapshot, keys, &names()).await?;
                    return Ok((WriteBatch::new(), ids));
                }
                let ids = grants::intern(&snapshot, keys, &names()).await?;
                let mut root = model::new_object(true, 0o755)?;
                root.id = manifest.tenant.root_id;
                let mut edit = Edit::new();
                edit.record(
                    keys,
                    &Record {
                        object: root,
                        parent: None,
                        revision: [0; 16],
                    },
                )?;
                edit.put(
                    keys.tenant(),
                    encode(&TenantRecord {
                        root: manifest.tenant.root_id,
                        key_hash: Sha256::digest(manifest.tenant.tenant_key.as_bytes()).into(),
                    })?,
                )?;
                edit.grant(
                    keys,
                    &manifest.tenant.root_id,
                    *ids.get("owner")
                        .ok_or_else(|| status(ErrorCode::Internal))?,
                    "owner",
                    true,
                )?;
                edit.put(
                    keys.tree_incarnation(),
                    ObjectId::new_v4().as_bytes().to_vec(),
                )?;
                edit.put(
                    Keys::registered_tenant(&manifest.tenant.tenant_id)?,
                    Vec::new(),
                )?;
                edit.put(manifest.cursor(0, 0), fingerprint.clone())?;
                edit.batch.apply(&snapshot)?;
                tree_log::publish(&snapshot, keys, &[manifest.tenant.root_id].into()).await?;
                Ok((WriteBatch::new(), ids))
            }
        })
        .await
}

/// @cc [owner:spolu,label:testing;backend] offline-complete-fixture
/// This operator MUST use a dedicated scale prefix and refuse existing targets. Each resumable
/// batch MUST atomically write real records, metadata, content, child/grant indexes, tree head/log,
/// parent revisions and search obligations together with its cursor. It MUST NOT serve filesystem
/// requests during population or present bulk fixture throughput as normal filesystem throughput.
/// Child index values MUST be exactly the raw 16 UUID bytes consumed by lookup and directory listing.
async fn populate(
    storage: &Storage,
    manifest: &Manifest,
    grants: &BTreeMap<String, GrantId>,
    directory: bool,
    worker: u32,
) -> Result<u64, Status> {
    let keys = Keys::new(&manifest.tenant.tenant_id)?;
    let limit = if directory {
        manifest.directories
    } else {
        manifest.files
    };
    let kind = if directory { 1 } else { 2 };
    let cursor_key = manifest.cursor(kind, worker);
    let stride = manifest.batch
        * if directory {
            1
        } else {
            manifest.workers as u64
        };
    storage
        .transact(|snapshot| {
            let keys = &keys;
            let cursor_key = &cursor_key;
            async move {
                let start = snapshot
                    .get(cursor_key)
                    .await?
                    .map(|v| decode::<u64>(&v))
                    .transpose()?
                    .unwrap_or(if directory {
                        1
                    } else {
                        1 + manifest.batch * worker as u64
                    });
                if start > limit {
                    return Ok((WriteBatch::new(), 0));
                }
                let end = (start + manifest.batch).min(limit + 1);
                let ids = (start..end)
                    .map(|i| manifest.id(directory, i))
                    .collect::<Result<Vec<_>, _>>()?;
                stream::iter(ids.clone())
                    .map(|id| {
                        let snapshot = &snapshot;
                        async move {
                            if snapshot.get(keys.object(&id)?).await?.is_some()
                                || snapshot
                                    .get(keys.tree_node(
                                        id.real().map_err(|_| status(ErrorCode::Internal))?,
                                    ))
                                    .await?
                                    .is_some()
                            {
                                return Err(status(ErrorCode::AlreadyExists));
                            }
                            Ok(())
                        }
                    })
                    .buffer_unordered(32)
                    .try_collect::<Vec<_>>()
                    .await?;
                let mut edit = Edit::new();
                let mut parents = BTreeSet::new();
                for (index, id) in (start..end).zip(ids) {
                    let parent_index = manifest.parent(directory, index)?;
                    let parent = manifest.id(true, parent_index)?;
                    parents.insert(parent_index);
                    let name = if directory {
                        format!("folder-{index:08}")
                    } else {
                        format!("document-{index:012}.txt")
                    };
                    let mut object =
                        model::new_object(directory, if directory { 0o755 } else { 0o644 })?;
                    object.id = id;
                    let payload = if directory { Vec::new() } else { data(index) };
                    object.size = payload.len() as u64;
                    edit.record(
                        keys,
                        &Record {
                            object,
                            parent: Some(Parent {
                                id: parent,
                                name: name.clone(),
                            }),
                            revision: [0; 16],
                        },
                    )?;
                    let mut metadata = Extended::new(directory);
                    if !directory {
                        metadata.mime_type = "text/plain".into();
                    }
                    edit.put(keys.metadata(&id)?, encode(&metadata)?)?;
                    edit.put(
                        keys.child(&parent, &name)?,
                        id.real()
                            .map_err(|_| status(ErrorCode::Internal))?
                            .as_bytes()
                            .to_vec(),
                    )?;
                    if !payload.is_empty() {
                        edit.put(keys.block(&id, 0)?, payload)?;
                    }
                    let has_grants = attached(directory, index);
                    if has_grants {
                        let name = format!("team-{:02}", index % 64);
                        let grant = *grants
                            .get(&name)
                            .ok_or_else(|| status(ErrorCode::Internal))?;
                        edit.grant(keys, &id, grant, &name, true)?;
                    }
                    let node = Node {
                        parent: Some(parent.real().map_err(|_| status(ErrorCode::Internal))?),
                        directory,
                        has_grants,
                        deleted: false,
                    }
                    .encode();
                    let object_id = id.real().map_err(|_| status(ErrorCode::Internal))?;
                    edit.batch.stamped_value(
                        keys.tree_node(object_id),
                        [[255; 10].as_slice(), node.as_slice()].concat(),
                        0,
                    );
                    let prefix = keys.tree_updates();
                    let offset = prefix.len();
                    edit.batch.stamped_key(
                        tree_log::index_key(prefix, Stamp([255; 10]), object_id),
                        node,
                        offset,
                    );
                }
                for parent_index in parents {
                    let parent = manifest.id(true, parent_index)?;
                    edit.batch.increment(keys.membership_version(&parent)?);
                    edit.batch.increment(keys.listing_version(&parent)?);
                    edit.batch.byte_max(
                        keys.directory_time(&parent)?,
                        model::ordered_time(model::now()?)?,
                    );
                    edit.search_pending(keys, &parent)?;
                    if parent_index > 0 {
                        let grandparent =
                            manifest.id(true, manifest.parent(true, parent_index)?)?;
                        edit.batch.increment(keys.listing_version(&grandparent)?);
                    }
                }
                edit.batch.increment(keys.authorization_version());
                edit.put(cursor_key.clone(), encode(&(start + stride))?)?;
                Ok((edit.batch, end - start))
            }
        })
        .await
}

/// @cc [owner:spolu,label:testing;backend] offline-fixture-child-repair
/// Repair MUST require the original matching fixture manifest and run without population or serving.
/// It MAY replace only the legacy tagged value for the exact deterministic child identity and key.
/// Already-correct values MUST remain unchanged; unfamiliar keys or values MUST stop the operation.
/// Batches MUST be bounded and idempotent, preserving object records, grants and tree state.
async fn repair_children(storage: &Storage, manifest: &Manifest) -> Result<(usize, usize), Status> {
    let keys = Keys::new(&manifest.tenant.tenant_id)?;
    let prefix = keys.all_children();
    let end = prefix_end(&prefix);
    let mut cursor = prefix.clone();
    let mut scanned = 0;
    let mut repaired = 0;
    loop {
        let (next, count, changed) = storage
            .transact(|snapshot| {
                let keys = &keys;
                let prefix = &prefix;
                let end = &end;
                let cursor = &cursor;
                async move {
                    let (rows, more) = snapshot.range(cursor, end, 1024).await?;
                    if rows.is_empty() && more {
                        return Err(status(ErrorCode::Unavailable));
                    }
                    let next = if more {
                        let mut next = rows
                            .last_key_value()
                            .ok_or_else(|| status(ErrorCode::Unavailable))?
                            .0
                            .clone();
                        next.push(0);
                        Some(next)
                    } else {
                        None
                    };
                    let mut batch = WriteBatch::new();
                    let mut changed = 0;
                    for (key, value) in &rows {
                        let name = key
                            .get(prefix.len() + 16..)
                            .and_then(|v| std::str::from_utf8(v).ok())
                            .ok_or_else(|| status(ErrorCode::Unavailable))?;
                        let (directory, number) = if let Some(number) = name.strip_prefix("folder-")
                        {
                            (true, number)
                        } else if let Some(number) = name
                            .strip_prefix("document-")
                            .and_then(|v| v.strip_suffix(".txt"))
                        {
                            (false, number)
                        } else {
                            return Err(status(ErrorCode::Unavailable));
                        };
                        let index: u64 =
                            number.parse().map_err(|_| status(ErrorCode::Unavailable))?;
                        let expected_name = if directory {
                            format!("folder-{index:08}")
                        } else {
                            format!("document-{index:012}.txt")
                        };
                        let limit = if directory {
                            manifest.directories
                        } else {
                            manifest.files
                        };
                        if index == 0 || index > limit || name != expected_name {
                            return Err(status(ErrorCode::Unavailable));
                        }
                        let id = manifest.id(directory, index)?;
                        let parent = manifest.id(true, manifest.parent(directory, index)?)?;
                        if *key != keys.child(&parent, name)? {
                            return Err(status(ErrorCode::Unavailable));
                        }
                        let raw = id.real().map_err(|_| status(ErrorCode::Unavailable))?;
                        if value.as_ref() == raw.as_bytes() {
                            continue;
                        }
                        if value.as_ref() != encode(&id)?.as_slice() {
                            return Err(status(ErrorCode::Unavailable));
                        }
                        batch.put(key.clone(), raw.as_bytes());
                        changed += 1;
                    }
                    Ok((batch, (next, rows.len(), changed)))
                }
            })
            .await?;
        scanned += count;
        repaired += changed;
        if scanned / 100_000 != (scanned - count) / 100_000 {
            eprintln!(
                "{}",
                serde_json::json!({"scanned_children":scanned,"repaired_children":repaired})
            );
        }
        match next {
            Some(next) => cursor = next,
            None => return Ok((scanned, repaired)),
        }
    }
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,dfs_core::storage=debug".into()),
        )
        .with_writer(std::io::stderr)
        .json()
        .init();
    dfs_server_v5::network::run(run())
}
async fn run() -> Result<()> {
    let config = Config::parse();
    ensure!(
        config.storage.fdb_prefix.starts_with("dfs-v5-scale-"),
        "dedicated dfs-v5-scale- prefix required"
    );
    ensure!(
        !config.repair_child_index || config.manifest.exists(),
        "repair requires the original manifest"
    );
    ensure!(
        (1..=100_000_000).contains(&config.files)
            && (1..=64).contains(&config.workers)
            && (1..=64).contains(&config.concurrency)
            && (1..=256).contains(&config.batch)
    );
    let manifest: Manifest = if config.manifest.exists() {
        serde_json::from_slice(&std::fs::read(&config.manifest)?)?
    } else {
        let mut secret = [0; 32];
        getrandom::fill(&mut secret)?;
        let manifest = Manifest {
            tenant: Tenant {
                tenant_id: config.tenant.clone(),
                root_id: ObjectRef::new_v4(),
                tenant_key: hex::encode(secret),
            },
            seed: *ObjectId::new_v4().as_bytes(),
            prefix: config.storage.fdb_prefix.clone(),
            files: config.files,
            directories: config.files.div_ceil(100),
            workers: config.workers,
            batch: config.batch,
        };
        write_private(&config.manifest, &serde_json::to_vec(&manifest)?)?;
        manifest
    };
    ensure!(
        manifest.tenant.tenant_id == config.tenant
            && manifest.prefix == config.storage.fdb_prefix
            && manifest.files == config.files
            && manifest.directories == manifest.files.div_ceil(100)
            && manifest.workers == config.workers
            && manifest.batch == config.batch,
        "resume configuration mismatch"
    );
    let storage = Storage::open(&config.storage).await?;
    let started = Instant::now();
    if config.repair_child_index {
        let snapshot = storage.snapshot().await?;
        let fingerprint = Sha256::digest(encode(&manifest)?).to_vec();
        ensure!(
            snapshot.get(manifest.cursor(0, 0)).await?.as_deref() == Some(fingerprint.as_slice())
                && snapshot
                    .get(Keys::new(&manifest.tenant.tenant_id)?.tenant())
                    .await?
                    .is_some(),
            "repair requires the original matching fixture"
        );
        drop(snapshot);
        let (scanned, repaired) = repair_children(&storage, &manifest).await?;
        println!(
            "{}",
            serde_json::json!({"tenant":manifest.tenant.tenant_id,
            "scanned_children":scanned,"repaired_children":repaired,
            "seconds":started.elapsed().as_secs_f64()})
        );
        return Ok(());
    }
    let grants = initialize(&storage, &manifest).await?;
    eprintln!(
        "{}",
        serde_json::json!({"stage":"directories","target":manifest.directories})
    );
    let mut directories = 0;
    loop {
        let count = populate(&storage, &manifest, &grants, true, 0).await?;
        if count == 0 {
            break;
        }
        directories += count;
        if directories / 10_000 != (directories - count) / 10_000 {
            eprintln!(
                "{}",
                serde_json::json!({"directories_inserted_this_process":directories,
                "seconds":started.elapsed().as_secs_f64()})
            );
        }
    }
    eprintln!(
        "{}",
        serde_json::json!({"stage":"files","target":manifest.files,
        "concurrency":config.concurrency.min(manifest.workers as usize)})
    );
    let inserted = Arc::new(AtomicU64::new(0));
    stream::iter(0..manifest.workers).map(|worker| {
        let storage = &storage; let manifest = &manifest; let grants = &grants; let inserted = &inserted;
        async move {
            loop {
                let count = populate(storage,manifest,grants,false,worker).await?;
                if count == 0 { break; }
                let total = inserted.fetch_add(count,Ordering::Relaxed) + count;
                if total / 100_000 != (total-count) / 100_000 {
                    eprintln!("{}", serde_json::json!({"inserted_this_process":total,"seconds":started.elapsed().as_secs_f64()}));
                }
            }
            Ok::<_, anyhow::Error>(())
        }
    }).buffer_unordered(config.concurrency.min(manifest.workers as usize)).try_collect::<Vec<_>>().await?;
    let keys = Keys::new(&manifest.tenant.tenant_id)?;
    let view = dfs_core::read::View::from_snapshot(
        storage.snapshot().await?,
        &manifest.tenant.tenant_id,
        BTreeSet::from(["owner".into()]),
    )
    .await?;
    for index in [1, manifest.files / 2 + 1, manifest.files] {
        let record = view.stat(&manifest.id(false, index)?).await?;
        ensure!(!record.object.directory && record.object.size == data(index).len() as u64);
        let parent = record.parent.context("file parent")?;
        ensure!(view.lookup(&parent.id, &parent.name).await?.id == record.object.id);
        ensure!(
            view.get(&keys.block(&record.object.id, 0)?)
                .await?
                .context("file content")?
                .as_ref()
                == data(index)
        );
    }
    let listing = view.list(&manifest.tenant.root_id, None, 32).await?;
    ensure!(listing.entries.len() == (manifest.directories.min(16) as usize));
    println!(
        "{}",
        serde_json::json!({"tenant":manifest.tenant.tenant_id,"files":manifest.files,"directories":manifest.directories,
        "nodes":manifest.files+manifest.directories+1,"inserted_files_this_process":inserted.load(Ordering::Relaxed),
        "population_seconds":started.elapsed().as_secs_f64(),"workers":manifest.workers,"batch":manifest.batch,
        "concurrency":config.concurrency.min(manifest.workers as usize),
        "mode":"offline complete fixture, resumable FDB batches; not filesystem throughput"})
    );
    Ok(())
}
