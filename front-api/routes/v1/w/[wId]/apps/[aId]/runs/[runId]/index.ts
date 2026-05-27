// Legacy endpoint: re-exports the canonical space-scoped run-retrieval handler,
// the same way the Next legacy route re-exports the canonical handler. Reached
// without a :spaceId in the path — `withSpace` falls back to the workspace
// global space. The parent runs sub-app already serves this path; this file
// exists to mirror the Next route for the migration pairing.
export { default } from "../../../../spaces/[spaceId]/apps/[aId]/runs/[runId]";
