import type { WorkspaceType } from "../user";

export function isDevelopment() {
  return process.env.NODE_ENV === "development";
}
export function isDustWorkspace(w: WorkspaceType) {
  return w.sId === process.env.PRODUCTION_DUST_WORKSPACE_ID;
}
