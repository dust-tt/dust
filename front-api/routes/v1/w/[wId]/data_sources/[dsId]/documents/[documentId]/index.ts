// Legacy endpoint: re-exports the canonical space-scoped handler. The parent
// `documents` sub-app already serves this path (it mounts `:documentId`); this
// file exists to mirror the Next route for the migration pairing. Reached
// without a `:spaceId` — the space-scoped handler falls back to the workspace
// global space via `resolveLegacyDataSourceSpaceId`.
export { default } from "@front-api/routes/v1/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]";
