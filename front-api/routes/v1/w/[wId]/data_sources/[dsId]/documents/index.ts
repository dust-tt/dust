// Legacy endpoint: re-exports the canonical space-scoped `documents` sub-app
// (documents list plus the `:documentId` sub-routes it mounts), the same way
// the Next legacy route re-exports the canonical handler. Reached without a
// `:spaceId` in the path — the space-scoped handlers fall back to the workspace
// global space via `resolveLegacyDataSourceSpaceId`. Mounted by
// `../../index.ts` so the legacy (non-spaced) URL layout is preserved.
export { default } from "@front-api/routes/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents";
