// Legacy endpoint: re-exports the canonical space-scoped `folders` sub-app
// (folders list plus the `:fId` sub-route it mounts), the same way the Next
// legacy route re-exports the canonical handler. Reached without a `:spaceId`
// in the path — the space-scoped handlers fall back to the workspace global
// space via `resolveLegacyDataSourceSpaceId`. Mounted by `../../index.ts` so
// the legacy file tree mirrors `front/pages/api`.
export { default } from "@front-api/routes/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/folders";
