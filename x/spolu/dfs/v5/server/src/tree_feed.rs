use crate::storage::{Storage, failed};
use dfs_core::{
    keys::{Keys, prefix_end},
    storage::after,
    tree::{Builder, Proof, TenantTree, Update},
    tree_log::{self, Control, Head, Interval, StampedUpdate},
};
use dfs_protocol::{ObjectId, error::status, rpc::ErrorCode};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tonic::Status;

type Result<T> = std::result::Result<T, Status>;

#[derive(Clone, Debug)]
pub struct Config {
    pub max_age_ms: u64,
    pub staging_bytes: usize,
    pub tenant_peak_bytes: usize,
    pub base_page_nodes: usize,
    pub(crate) cancelled: Option<Arc<AtomicBool>>,
    #[cfg(test)]
    pub(crate) bootstrap_pause: Option<Arc<BootstrapPause>>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            max_age_ms: 30_000,
            staging_bytes: 16 * 1024 * 1024,
            tenant_peak_bytes: 1024 * 1024 * 1024,
            base_page_nodes: 1024,
            cancelled: None,
            #[cfg(test)]
            bootstrap_pause: None,
        }
    }
}
#[cfg(test)]
#[derive(Debug)]
pub(crate) struct BootstrapPause {
    pub entered: tokio::sync::Notify,
    pub release: tokio::sync::Semaphore,
}
impl Config {
    fn active(&self) -> Result<()> {
        if self
            .cancelled
            .as_ref()
            .is_some_and(|flag| flag.load(Ordering::Acquire))
        {
            return Err(status(ErrorCode::Unavailable));
        }
        Ok(())
    }
    pub fn validate(&self) -> Result<()> {
        if self.max_age_ms == 0
            || self.staging_bytes < 4096
            || self.tenant_peak_bytes < self.staging_bytes.saturating_mul(4)
            || !(1..=4096).contains(&self.base_page_nodes)
        {
            return Err(status(ErrorCode::InvalidInput));
        }
        Ok(())
    }
}

pub struct Replica {
    pub tree: Arc<TenantTree>,
    storage: Storage,
    keys: Keys,
    durable_incarnation: ObjectId,
    config: Config,
}
impl Replica {
    /// @cc [owner:spolu,label:performance;concurrency] poll-reservation-bound
    /// The reservation MUST cover resident and replacement buffers plus the full staged interval.
    /// Hydration accounts at least 192 bytes per node and four per grant; publication accounts 512
    /// per node and sixteen per grant, so four staging budgets cover its preparation. The configured
    /// ceiling remains enforced by publish_bounded before allocation.
    pub(crate) fn poll_peak_bytes(&self) -> usize {
        self.tree
            .memory_bytes()
            .saturating_mul(3)
            .saturating_add(self.config.staging_bytes.saturating_mul(5))
            .min(self.config.tenant_peak_bytes)
    }
    /// @cc [owner:spolu,label:security;backend] scalable-bootstrap-reconciliation
    /// Base pages MUST use short independent snapshots and hydrate grants in their page's snapshot.
    /// A complete feed interval MUST be merged between pages from a cursor captured before the base
    /// scan. Publication MUST wait for the full base scan, catch-up through every base version, full
    /// graph validation and a fresh control fence. The builder MUST never serve authorization.
    pub async fn bootstrap(
        storage: Storage,
        tenant: &str,
        root: ObjectId,
        config: Config,
    ) -> Result<Self> {
        Self::bootstrap_reserved(storage, tenant, root, config, Arc::new(())).await
    }
    pub(crate) async fn bootstrap_reserved(
        storage: Storage,
        tenant: &str,
        root: ObjectId,
        config: Config,
        reservation: Arc<dyn Send + Sync>,
    ) -> Result<Self> {
        config.validate()?;
        config.active()?;
        let keys = Keys::new(tenant)?;
        let initial = storage.snapshot().await?;
        let control = tree_log::control(&initial, &keys).await?;
        let mut version = initial.read_version;
        drop(initial);
        let mut builder = Builder::new(root, config.tenant_peak_bytes - config.staging_bytes);
        let mut cursor = keys.tree_nodes();
        let mut poll_started;
        #[cfg(test)]
        let mut first_page = true;
        loop {
            config.active()?;
            let snapshot = storage.snapshot().await?;
            let page_control = tree_log::control(&snapshot, &keys).await?;
            if page_control.incarnation != control.incarnation
                || version < page_control.resume_floor
            {
                return Err(status(ErrorCode::StaleView));
            }
            let base_version = snapshot.read_version;
            let (rows, more) = snapshot
                .range(
                    &cursor,
                    &prefix_end(&keys.tree_nodes()),
                    config.base_page_nodes,
                )
                .await?;
            if let Some((last, _)) = rows.last_key_value() {
                cursor = after(last);
            } else if more {
                return Err(status(ErrorCode::Unavailable));
            }
            let mut staged = Vec::new();
            let mut bytes = 0usize;
            for (key, value) in rows {
                if key.len() != keys.tree_nodes().len() + 16 {
                    return Err(status(ErrorCode::Unavailable));
                }
                let id = ObjectId::try_from(&key[keys.tree_nodes().len()..]).map_err(failed)?;
                let head = Head::decode(&value)?;
                bytes = bytes.saturating_add(192);
                if bytes > config.staging_bytes {
                    return Err(status(ErrorCode::Capacity));
                }
                let update = tree_log::hydrate(
                    &snapshot,
                    &keys,
                    id,
                    head.node,
                    config.staging_bytes - bytes,
                )
                .await?;
                if let Update::Live(image) = &update {
                    bytes = bytes.saturating_add(image.grants.capacity() * 4);
                }
                staged.push(StampedUpdate {
                    stamp: head.stamp,
                    update,
                });
            }
            drop(snapshot);
            for update in staged {
                builder.merge(update.stamp, update.update).map_err(failed)?;
            }
            #[cfg(test)]
            if std::mem::take(&mut first_page)
                && let Some(pause) = &config.bootstrap_pause
            {
                pause.entered.notify_one();
                pause.release.acquire().await.map_err(failed)?.forget();
            }
            poll_started = Instant::now();
            let interval = completed_interval(
                &storage,
                &keys,
                control.incarnation,
                version,
                config.staging_bytes,
            )
            .await?;
            if interval.version < base_version {
                return Err(status(ErrorCode::Unavailable));
            }
            for update in interval.updates {
                builder.merge(update.stamp, update.update).map_err(failed)?;
            }
            version = interval.version;
            if !more {
                break;
            }
            tokio::task::yield_now().await;
        }
        let (tree, reservation) =
            tokio::task::spawn_blocking(move || (builder.finish(), reservation))
                .await
                .map_err(failed)?;
        let tree = tree.map_err(failed)?;
        config.active()?;
        // A new in-memory incarnation prevents token reuse after a rebuild or process restart.
        let proof = Proof {
            incarnation: ObjectId::new_v4(),
            generation: 0,
            read_version: version,
            poll_started,
        };
        let tree = Arc::new(
            TenantTree::new_reserved(
                tree,
                proof,
                Duration::from_millis(config.max_age_ms),
                reservation,
            )
            .map_err(failed)?,
        );
        let mut replica = Self {
            tree,
            storage,
            keys,
            durable_incarnation: control.incarnation,
            config,
        };
        // Validation of a very large graph can outlast the age budget. Renew from a new complete
        // interval after validation, while the finished tree is still private.
        replica.poll().await?;
        Ok(replica)
    }

    /// @cc [owner:spolu,label:security;concurrency] poll-publication-fence
    /// Polls MUST publish one entire interval after a fresh incarnation/floor check. Failed reads,
    /// budget checks or publication MUST leave the prior tree/cursor/age unchanged. Empty completed
    /// intervals MUST advance the read-version and age proof without changing permission generation.
    pub async fn poll(&mut self) -> Result<Proof> {
        self.config.active()?;
        let started = Instant::now();
        let expected = self.tree.proof();
        let interval = completed_interval(
            &self.storage,
            &self.keys,
            self.durable_incarnation,
            expected.read_version,
            self.config.staging_bytes,
        )
        .await?;
        self.tree
            .publish_bounded(
                expected,
                interval.version,
                started,
                interval.updates.into_iter().map(|u| u.update).collect(),
                Instant::now(),
                self.config.tenant_peak_bytes - self.config.staging_bytes,
            )
            .map_err(failed)
    }
}

async fn completed_interval(
    storage: &Storage,
    keys: &Keys,
    incarnation: ObjectId,
    version: i64,
    max_bytes: usize,
) -> Result<Interval> {
    let snapshot = storage.snapshot().await?;
    let interval = tree_log::interval(&snapshot, keys, version, max_bytes).await?;
    if interval.control.incarnation != incarnation {
        return Err(status(ErrorCode::StaleView));
    }
    drop(snapshot);
    let fresh = storage.snapshot().await?;
    fence(
        interval.control,
        interval.version,
        tree_log::control(&fresh, keys).await?,
    )?;
    Ok(interval)
}

fn fence(start: Control, version: i64, fresh: Control) -> Result<()> {
    if start.incarnation != fresh.incarnation || fresh.resume_floor > version {
        return Err(status(ErrorCode::StaleView));
    }
    Ok(())
}
