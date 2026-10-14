use anyhow::Result;

mod directory;
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
        directory::child_creation_records_the_entry_and_bumps_the_directory().await?;
        directory::child_creation_retry_returns_the_committed_child().await?;
        directory::child_creation_rejections_leave_storage_unchanged().await?;
        directory::child_lookup_resolves_names_within_each_directory().await?;
        directory::child_listing_pages_through_entries_in_name_order().await?;
        directory::child_listing_rejects_invalid_limits_and_cursors().await?;
        object::root_creation_persists_isolated_records().await?;
        object::object_creation_retry_succeeds_without_changes().await?;
        object::object_collisions_preserve_records_and_abort_staged_writes().await?;
        object::invalid_xattr_names_fail_before_staging_writes().await?;
        object::xattr_size_limit_counts_all_names_and_values().await?;
        object::grant_listing_and_updates_preserve_indexes_and_attributes().await?;
        object::grant_update_retry_only_advances_grants_version().await?;
        object::grant_versions_advance_for_no_ops_and_reject_overflow().await?;
        object::grant_creation_and_update_validation_preserve_state().await?;
        object::grant_pagination_handles_full_pages_and_object_deletion().await?;
        object::modes_for_session_evaluate_full_paths_and_all_grants().await?;
        object::grant_cache_skips_matching_versions_and_preserves_session_snapshots().await?;
        object::tree_hints_follow_moves_and_recheck_grants().await?;
        object::modes_for_session_isolate_tenants_and_reject_invalid_ancestry().await?;
        object::permission_reads_conflict_with_changes_and_retry().await?;
        object::stat_distinguishes_object_errors_and_preserves_transaction_failures().await?;
        object::virtual_stat_projects_root_and_keeps_shared_versions_fixed().await?;
        object::metadata_reads_preserve_snapshot_and_tenant_scope().await?;
        session::subjects_are_exact_deduplicated_and_bounded()?;
        session::creation_persists_indexes_and_preserves_existing_sessions().await?;
        session::session_creation_retry_succeeds_without_changes().await?;
        session::session_refresh_retry_keeps_the_session_and_one_expiry_entry().await?;
        session::authentication_and_refresh_require_active_matching_state().await?;
        session::refresh_and_revocation_conflict_in_both_orders().await?;
        session::expiry_cleanup_is_bounded_and_preserves_live_sessions().await?;
        session::expiry_cleanup_conflicts_with_concurrent_changes().await?;
        tenant::tenant_key_collisions_preserve_the_existing_owner().await?;
        tenant::decoding_errors_abort_creation_and_retain_their_type().await?;
        tenant::tenant_creation_retry_succeeds_without_changes().await?;
        tenant::authentication_requires_a_matching_index_and_tenant_record().await
    })
}
