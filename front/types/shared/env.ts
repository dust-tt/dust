import type { LightWorkspaceType } from "../user";

export function isDevelopment() {
  return (
    process.env.NODE_ENV === "development" || process.env.ANALYZE === "true"
  );
}
export function isTest() {
  return process.env.NODE_ENV === "test";
}
export function isDustWorkspace(w: LightWorkspaceType) {
  return w.sId === process.env.PRODUCTION_DUST_WORKSPACE_ID;
}
