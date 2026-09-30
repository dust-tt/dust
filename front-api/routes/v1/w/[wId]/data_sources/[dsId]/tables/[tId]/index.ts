// Legacy endpoint: re-exports the canonical space-scoped `:tId` sub-app (table
// get/delete plus the `parents` and `rows` sub-routes it mounts). The parent
// `tables` sub-app already serves this path (it mounts `:tId`); this file
// exists to mirror the Next route for the migration pairing. Reached without a
// `:spaceId` — the space-scoped handlers fall back to the workspace global
// space via `resolveLegacyDataSourceSpaceId`.
export { default } from "@front-api/routes/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/[tId]";
