use anyhow::Result;

mod object;
mod session;
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

    runtime.block_on(async {
        object::root_creation_persists_isolated_records().await?;
        object::object_collisions_preserve_records_and_abort_staged_writes().await?;
        session::subjects_are_exact_deduplicated_and_bounded()?;
        session::creation_persists_indexes_and_preserves_existing_sessions().await?;
        session::authentication_and_refresh_require_active_matching_state().await?;
        session::refresh_and_revocation_conflict_in_both_orders().await?;
        session::expiry_cleanup_is_bounded_and_preserves_live_sessions().await?;
        session::expiry_cleanup_conflicts_with_concurrent_changes().await?;
        tenant::tenant_key_collisions_preserve_the_existing_owner().await?;
        tenant::decoding_errors_abort_creation_and_retain_their_type().await?;
        tenant::authentication_requires_a_matching_index_and_tenant_record().await
    })
}
