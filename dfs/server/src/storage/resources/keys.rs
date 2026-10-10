use foundationdb::tuple::Subspace;

/// Bumped on an incompatible key layout change, so new keys never mix with old ones.
const LAYOUT: &str = "dfs-v1";
/// Fixed to `test` until dfs gets deployment config to select `prod`.
const ENV: &str = "test";

/// The namespace for tenant data and global indexes: `dfs-v1-{env}` (STORAGE.md).
pub fn namespace_subspace() -> Subspace {
    Subspace::from(format!("{LAYOUT}-{ENV}"))
}

/// The prefix for tenant-scoped records: `dfs-v1-{env}/tenant/<tenantId>` (STORAGE.md).
pub fn tenant_subspace(tenant_id: &str) -> Subspace {
    namespace_subspace().subspace(&("tenant", tenant_id))
}
