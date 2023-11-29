import { WorkspaceType } from "@dust-tt/types";

const PRODUCTION_DUST_WORKSPACE_ID = "0ec9852c2f";
export function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

export function isDevelopmentOrDustWorkspace(owner: WorkspaceType) {
  return isDevelopment() || owner.sId === PRODUCTION_DUST_WORKSPACE_ID;
}
