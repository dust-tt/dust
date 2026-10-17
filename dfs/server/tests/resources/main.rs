use anyhow::Result;

mod directory;
mod file;
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
        file::batch_reads_reject_invalid_ids_and_preserve_transaction_errors().await?;
        file::batch_reads_budget_only_data_and_preserve_per_file_errors().await?;
        file::reads_clip_to_eof_and_zero_fill_sparse_and_short_blocks().await?;
        file::reads_preserve_tenant_scope_snapshot_and_attributes().await?;
        file::reads_validate_kind_length_blocks_and_handle_maximum_offsets().await?;
        file::block_reads_conflict_with_concurrent_writes().await?;
        file::writes_merge_blocks_and_preserve_unrelated_state().await?;
        file::writes_reject_invalid_operations_without_staging_changes().await?;
        file::writes_replay_append_results_and_follow_truncation().await?;
        file::writes_conflict_with_concurrent_append_and_grant_revocation().await?;
        directory::child_creation_records_the_entry_and_bumps_the_directory().await?;
        directory::apply_create_receipt_preserves_per_operation_results().await?;
        directory::apply_create_rejections_leave_no_staged_writes().await?;
        directory::apply_create_conflicts_with_grant_revocation().await?;
        directory::apply_remove_clears_owned_records_and_updates_parent().await?;
        directory::apply_remove_rejections_leave_no_staged_writes().await?;
        directory::apply_remove_receipt_preserves_deleted_parent_attributes().await?;
        directory::apply_remove_conflicts_with_new_children().await?;
        directory::apply_move_preserves_records_and_updates_versions().await?;
        directory::apply_move_receipt_preserves_per_operation_results().await?;
        directory::apply_move_collisions_preserve_destinations_and_concurrent_children().await?;
        directory::apply_remove_then_move_serializes_destination_operations().await?;
        directory::apply_move_rejections_leave_no_staged_writes().await?;
        directory::apply_moves_in_separate_transactions_conflict_on_ancestry().await?;
        directory::apply_moves_with_disjoint_targets_cannot_create_a_cycle().await?;
        directory::child_creation_rejections_leave_storage_unchanged().await?;
        directory::child_creation_rejects_old_ids_and_accepts_recent_ids().await?;
        directory::shared_name_is_only_reserved_under_the_tenant_root().await?;
        directory::child_lookup_resolves_names_within_each_directory().await?;
        directory::lookup_attrs_require_readable_parents_and_children().await?;
        directory::child_listing_pages_through_entries_in_name_order().await?;
        directory::child_listing_rejects_invalid_limits_and_cursors().await?;
        directory::list_for_session_returns_readable_children_only().await?;
        directory::list_rejects_invalid_references_before_reading().await?;
        directory::virtual_root_pages_keep_shared_within_the_limit().await?;
        object::root_creation_persists_isolated_records().await?;
        object::updates_patch_metadata_and_preserve_receipt_results().await?;
        object::updates_reject_invalid_patches_without_staging_writes().await?;
        object::updates_resize_files_without_restoring_discarded_bytes().await?;
        object::updates_conflict_with_grant_revocation().await?;
        object::object_collisions_preserve_records_and_abort_staged_writes().await?;
        object::invalid_xattr_names_fail_before_staging_writes().await?;
        object::xattr_size_limit_counts_all_names_and_values().await?;
        object::grant_listing_and_updates_preserve_indexes_and_attributes().await?;
        object::grant_versions_advance_for_no_ops().await?;
        object::grant_creation_and_update_validation_preserve_state().await?;
        object::grant_pagination_handles_full_pages_and_object_deletion().await?;
        object::modes_for_session_evaluate_full_paths_and_all_grants().await?;
        object::grant_cache_skips_matching_versions_and_preserves_session_snapshots().await?;
        object::tree_hints_follow_moves_and_recheck_grants().await?;
        object::ancestry_reads_follow_stale_hints_without_reading_grants().await?;
        object::ancestry_reads_validate_paths_and_conflict_with_reparenting().await?;
        object::modes_for_session_isolate_tenants_and_reject_invalid_ancestry().await?;
        object::permission_reads_conflict_with_changes_and_retry().await?;
        object::stat_distinguishes_object_errors_and_preserves_transaction_failures().await?;
        object::virtual_stat_projects_root_and_keeps_shared_versions_fixed().await?;
        object::metadata_reads_preserve_snapshot_and_tenant_scope().await?;
        session::subjects_are_exact_deduplicated_and_bounded()?;
        session::creation_persists_indexes_and_preserves_existing_sessions().await?;
        session::authentication_and_refresh_require_active_matching_state().await?;
        session::refresh_and_revocation_conflict_in_both_orders().await?;
        session::expiry_cleanup_is_bounded_and_preserves_live_sessions().await?;
        session::expiry_cleanup_conflicts_with_concurrent_changes().await?;
        tenant::tenant_key_collisions_preserve_the_existing_owner().await?;
        tenant::decoding_errors_abort_creation_and_retain_their_type().await?;
        tenant::duplicate_tenant_creation_preserves_records().await?;
        tenant::authentication_requires_a_matching_index_and_tenant_record().await
    })
}
