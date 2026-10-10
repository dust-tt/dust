use anyhow::Result;

mod tenant;

/// The network boots once per process, so resource checks share this test and its network guard.
#[test]
fn resources() -> Result<()> {
    // SAFETY: the only `boot` in this test binary; `_network` is dropped when this test returns.
    #[allow(unsafe_code)]
    let _network = unsafe { foundationdb::boot() };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    runtime.block_on(tenant::tenant_key_collisions_preserve_the_existing_owner())
}
