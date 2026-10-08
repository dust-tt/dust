use crate::storage::Storage;
use clap::Args;
use dfs_core::{
    keys::Keys,
    storage::{after, failed},
    tree_log::{self, Limits},
};
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};
use tonic::Status;

#[derive(Clone, Debug, Args)]
#[group(id = "TreeGc")]
pub struct Config {
    #[arg(long, default_value_t = 3600)]
    pub tree_tombstone_retention_seconds: u64,
    #[arg(long, default_value_t = 1_000_000)]
    pub tree_tombstone_max_count: u64,
    #[arg(long, default_value_t = 536_870_912)]
    pub tree_tombstone_max_bytes: u64,
    #[arg(long, default_value_t = 1000)]
    pub tree_gc_interval_ms: u64,
    #[arg(long, default_value_t = 256)]
    pub tree_gc_batch: usize,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            tree_tombstone_retention_seconds: 3600,
            tree_tombstone_max_count: 1_000_000,
            tree_tombstone_max_bytes: 512 * 1024 * 1024,
            tree_gc_interval_ms: 1000,
            tree_gc_batch: 256,
        }
    }
}
impl Config {
    pub fn limits(&self) -> Limits {
        Limits {
            max_count: self.tree_tombstone_max_count,
            max_bytes: self.tree_tombstone_max_bytes,
        }
    }
    pub fn validate(&self) -> anyhow::Result<()> {
        anyhow::ensure!(
            self.tree_tombstone_retention_seconds > 0
                && self.tree_tombstone_retention_seconds <= 365 * 24 * 3600
                && self.tree_tombstone_max_count > 0
                && self.tree_tombstone_max_count <= i64::MAX as u64
                && self.tree_tombstone_max_bytes >= 4096
                && self.tree_gc_interval_ms > 0
                && self.tree_gc_interval_ms <= 60_000
                && (1..=1024).contains(&self.tree_gc_batch),
            "invalid tree tombstone collection configuration"
        );
        Ok(())
    }
}

struct ClockSamples {
    values: VecDeque<(Instant, i64)>,
    cutoff: i64,
    retention: Duration,
    sample_step: Duration,
}
impl ClockSamples {
    fn new(retention: Duration) -> Self {
        Self {
            values: VecDeque::new(),
            cutoff: 0,
            retention,
            sample_step: (retention / 4094).max(Duration::from_secs(1)),
        }
    }
    fn observe(&mut self, now: Instant, version: i64) -> i64 {
        while self
            .values
            .front()
            .is_some_and(|(time, _)| now.saturating_duration_since(*time) >= self.retention)
        {
            if let Some((_, version)) = self.values.pop_front() {
                self.cutoff = self.cutoff.max(version);
            }
        }
        if self
            .values
            .back()
            .is_none_or(|(time, _)| now.saturating_duration_since(*time) >= self.sample_step)
        {
            self.values.push_back((now, version));
        }
        self.cutoff
    }
}

/// @cc [owner:spolu,label:backend;security] bounded-disconnected-tenant-gc
/// The collector MUST discover tenants from the durable registry, including tenants with no local
/// sessions. Age cutoffs MUST use bounded monotonic-time/read-version samples, never an assumed FDB
/// version rate. Collection MUST preserve the transactional floor protocol. Filesystem deletion
/// MUST apply backpressure at the configured count/byte ceiling if collection cannot keep up.
pub struct Collector {
    storage: Storage,
    config: Config,
    cursor: Vec<u8>,
    samples: ClockSamples,
    admission: Option<std::sync::Arc<tokio::sync::Semaphore>>,
}
impl Collector {
    pub fn new(storage: Storage, config: Config) -> anyhow::Result<Self> {
        config.validate()?;
        let samples =
            ClockSamples::new(Duration::from_secs(config.tree_tombstone_retention_seconds));
        Ok(Self {
            storage,
            config,
            cursor: vec![2],
            samples,
            admission: None,
        })
    }
    pub fn with_admission(mut self, admission: std::sync::Arc<tokio::sync::Semaphore>) -> Self {
        self.admission = Some(admission);
        self
    }
    pub async fn run(mut self) {
        let mut interval =
            tokio::time::interval(Duration::from_millis(self.config.tree_gc_interval_ms));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if let Err(error) = self.tick().await {
                tracing::warn!(code = ?error.code(), "tree tombstone collection failed");
            }
        }
    }
    pub async fn tick(&mut self) -> Result<(), Status> {
        let _permit = match &self.admission {
            Some(admission) => Some(admission.clone().acquire_owned().await.map_err(failed)?),
            None => None,
        };
        let snapshot = self.storage.snapshot().await?;
        // Sampling after GRV completion conservatively ages every commit at or below that version.
        let cutoff = self.samples.observe(Instant::now(), snapshot.read_version);
        let (tenants, more) = snapshot.range(&self.cursor, &[3], 16).await?;
        drop(snapshot);
        let batch_limit = self.config.tree_gc_batch;
        let mut error = None;
        for key in tenants.keys() {
            let tenant = std::str::from_utf8(&key[1..]).map_err(failed)?;
            let keys = Keys::new(tenant)?;
            // Collect at 90% of the hard limit to leave room for arriving deletions between sweeps.
            let target = self.config.limits().capacity(&keys) / 10 * 9;
            let result = self
                .storage
                .transact(|snapshot| {
                    let keys = &keys;
                    async move {
                        let batch = tree_log::collect(
                            &snapshot,
                            keys,
                            cutoff,
                            target,
                            u64::MAX,
                            batch_limit,
                        )
                        .await?;
                        Ok((batch, ()))
                    }
                })
                .await;
            if let Err(failed) = result {
                error = Some(failed);
            }
            self.cursor = after(key);
        }
        if !more {
            self.cursor = vec![2];
        }
        match error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn samples_use_elapsed_time_without_assuming_a_version_rate() {
        let mut samples = ClockSamples::new(Duration::from_secs(10));
        let start = Instant::now();
        assert_eq!(samples.observe(start, 100), 0);
        assert_eq!(
            samples.observe(start + Duration::from_secs(9), 1_000_000),
            0
        );
        assert_eq!(
            samples.observe(start + Duration::from_secs(10), 1_000_001),
            100
        );
        assert_eq!(
            samples.observe(start + Duration::from_secs(19), 9_000_000),
            1_000_000
        );
        assert!(samples.values.len() <= 4096);
    }
}
