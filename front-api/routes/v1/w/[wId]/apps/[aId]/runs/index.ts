// Legacy endpoint: re-exports the canonical space-scoped runs sub-app (run
// creation POST and run retrieval GET /:runId), the same way the Next legacy
// route re-exports the canonical handler. Reached without a :spaceId in the
// path — `withSpace` falls back to the workspace global space.
export { default } from "../../../spaces/[spaceId]/apps/[aId]/runs";
