use std::future::Future;

/// @cc [owner:spolu,label:rust;concurrency] fdb-network-lifetime
/// This entry point MUST run at most once per process. The operation MUST NOT return FDB handles or
/// leak them outside its runtime. The runtime and all FDB work MUST stop before the network is dropped.
#[allow(unsafe_code)]
pub fn run(operation: impl Future<Output = anyhow::Result<()>>) -> anyhow::Result<()> {
    let builder = foundationdb::api::FdbApiBuilder::default().build()?;
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
