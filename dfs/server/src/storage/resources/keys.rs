use foundationdb::tuple::Subspace;

/// Bumped on an incompatible key layout change, so new keys never mix with old ones.
const LAYOUT: &str = "dfs-v1";
/// Fixed to `test` until dfs gets deployment config to select `prod`.
const ENV: &str = "test";

/// The prefix of every key a tenant owns: `dfs-v1-{env}/tenants/<tenantId>` (STORAGE.md).
pub fn tenant_subspace(tenant_id: &str) -> Subspace {
    let namespace = format!("{LAYOUT}-{ENV}");
    Subspace::from((namespace.as_str(), "tenants", tenant_id))
}
