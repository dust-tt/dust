//! Optional aggregate diagnostics; disabled unless DFS_PROFILE=1.
use std::{
    sync::{
        OnceLock,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};

struct Metric {
    calls: AtomicU64,
    nanos: AtomicU64,
    items: AtomicU64,
    max_items: AtomicU64,
}
impl Metric {
    const fn new() -> Self {
        Self {
            calls: AtomicU64::new(0),
            nanos: AtomicU64::new(0),
            items: AtomicU64::new(0),
            max_items: AtomicU64::new(0),
        }
    }
}
macro_rules! phases {
    ($($variant:ident => $name:literal),+ $(,)?) => {
        #[derive(Clone, Copy)]
        pub(crate) enum Phase { $($variant),+ }
        const NAMES: &[&str] = &[$($name),+];
        static METRICS: [Metric; NAMES.len()] = [const { Metric::new() }; NAMES.len()];
    };
}
phases! {
    Stat => "rpc.stat", Lookup => "rpc.lookup", List => "rpc.list", Read => "rpc.read",
    Fsync => "rpc.fsync", Create => "rpc.create", Update => "rpc.update",
    Rename => "rpc.rename", Remove => "rpc.remove", Write => "rpc.write",
    Snapshot => "cache.snapshot", SnapshotRam => "cache.snapshot_ram",
    Reap => "cache.reap", Overlay => "cache.overlay_scan", Accept => "cache.accept",
    Select => "cache.select", Publish => "publication.total",
    Prefetch => "read.prefetch", Object => "read.object", Authorize => "read.authorize",
    Child => "read.child", Collision => "read.collision", Block => "read.block",
    FdbVersion => "fdb.read_version", FdbGet => "fdb.get", FdbRange => "fdb.range",
    FdbCommit => "fdb.commit",
}
fn enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var("DFS_PROFILE").is_ok_and(|v| v == "1"))
}

/// @cc [owner:spolu,label:performance;security] bounded-aggregate-profiling
/// Diagnostics MUST be opt-in, bounded by fixed phase names, and contain no user data or keys.
/// Durations include waits and overlapping work; nested/parallel phases MUST NOT be added as wall time.
pub(crate) struct Guard {
    phase: Phase,
    start: Option<Instant>,
    items: usize,
}
impl Guard {
    pub fn new(phase: Phase) -> Self {
        Self {
            phase,
            start: enabled().then(Instant::now),
            items: 0,
        }
    }
    pub fn items(&mut self, items: usize) {
        self.items = items;
    }
}
impl Drop for Guard {
    fn drop(&mut self) {
        if let Some(start) = self.start {
            let metric = &METRICS[self.phase as usize];
            metric.calls.fetch_add(1, Ordering::Relaxed);
            metric
                .nanos
                .fetch_add(start.elapsed().as_nanos() as u64, Ordering::Relaxed);
            metric.items.fetch_add(self.items as u64, Ordering::Relaxed);
            metric
                .max_items
                .fetch_max(self.items as u64, Ordering::Relaxed);
        }
    }
}
pub(crate) fn report() {
    if !enabled() {
        return;
    }
    let phases: std::collections::BTreeMap<_, _> = NAMES
        .iter()
        .zip(&METRICS)
        .map(|(name, metric)| {
            (
                *name,
                serde_json::json!({
                    "calls": metric.calls.load(Ordering::Relaxed),
                    "elapsed_ms": metric.nanos.load(Ordering::Relaxed) as f64 / 1_000_000.0,
                    "items": metric.items.load(Ordering::Relaxed),
                    "max_items": metric.max_items.load(Ordering::Relaxed),
                }),
            )
        })
        .collect();
    tracing::info!(profile = %serde_json::json!(phases), "server profile");
}
