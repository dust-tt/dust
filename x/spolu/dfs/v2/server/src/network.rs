use anyhow::{Context, ensure};
use foundationdb::options::NetworkOption;
use std::future::Future;

/// @cc [owner:spolu,label:rust;concurrency] fdb-network-lifetime
/// This entry point MUST run at most once per process. The operation MUST NOT return FDB handles or
/// leak them outside its runtime. The runtime and all FDB work MUST stop before the network is dropped.
#[allow(unsafe_code)]
pub fn run(operation: impl Future<Output = anyhow::Result<()>>) -> anyhow::Result<()> {
    let mut builder = foundationdb::api::FdbApiBuilder::default().build()?;
    for (variable, knob, default) in [
        (
            "DFS_FDB_GRV_BATCH_TIMEOUT_SECONDS",
            "grv_batch_timeout",
            0.005,
        ),
        (
            "DFS_FDB_CLIENT_BUSY_WAIT_SECONDS",
            "busy_wait_threshold",
            0.0,
        ),
    ] {
        let seconds = match std::env::var(variable) {
            Ok(value) => value
                .parse::<f64>()
                .with_context(|| format!("invalid {variable}"))?,
            Err(std::env::VarError::NotPresent) => default,
            Err(error) => return Err(error).with_context(|| format!("invalid {variable}")),
        };
        ensure!(
            seconds.is_finite() && seconds >= 0.0,
            "{variable} must be finite and nonnegative"
        );
        builder = builder.set_option(NetworkOption::Knob(format!("{knob}={seconds}")))?;
    }
    // SAFETY: This scope retains the network until the runtime and its tasks have been dropped.
    let network = unsafe { builder.boot()? };
    let result = {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()?;
        runtime.block_on(operation)
    };
    drop(network);
    result
}
