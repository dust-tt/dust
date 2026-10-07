use std::future::Future;

/// @cc [owner:spolu,label:rust;concurrency] fdb-network-lifetime
/// Run at most once per process. All database handles and tasks MUST be dropped before the network.
#[allow(unsafe_code)]
pub fn run(operation: impl Future<Output = anyhow::Result<()>>) -> anyhow::Result<()> {
    // SAFETY: The runtime and all of its tasks are dropped before the FDB network.
    let network = unsafe { foundationdb::boot() };
    let result = {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()?;
        runtime.block_on(operation)
    };
    drop(network);
    result
}
