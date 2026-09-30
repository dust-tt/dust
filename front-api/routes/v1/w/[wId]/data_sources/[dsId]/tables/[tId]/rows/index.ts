// Legacy endpoint: re-exports the canonical space-scoped `rows` sub-app (rows
// list/upsert plus the `:rId` sub-route it mounts). The parent `tables` sub-app
// already serves this path (its `:tId` sub-app mounts `rows`); this file exists
// to mirror the Next route for the migration pairing. Reached without a
// `:spaceId` — the space-scoped handlers fall back to the workspace global
// space via `resolveLegacyDataSourceSpaceId`.
export { default } from "@front-api/routes/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/[tId]/rows";
