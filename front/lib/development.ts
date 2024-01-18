import type { WorkspaceType } from "@dust-tt/types";

const PRODUCTION_DUST_WORKSPACE_ID = "0ec9852c2f";
const PRODUCTION_DUST_APPS_WORKSPACE_ID = "78bda07b39";

export function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

export function isDevelopmentOrDustWorkspace(owner: WorkspaceType) {
  return (
    isDevelopment() ||
    owner.sId === PRODUCTION_DUST_WORKSPACE_ID ||
    owner.sId === PRODUCTION_DUST_APPS_WORKSPACE_ID
  );
}

export function isActivatedStructuredDB(owner: WorkspaceType) {
  // We will manually add workspace ids here.
  return (
    isDevelopmentOrDustWorkspace(owner) ||
    [
      "47cc56f99e", // Henry's workspace;
      "bd133dacaa", // Daph's workspace;
    ].includes(owner.sId)
  );
}

export function isActivatedPublicURLs(owner: WorkspaceType) {
  // We will manually add workspace ids here.
  return (
    isDevelopmentOrDustWorkspace(owner) ||
    [PRODUCTION_DUST_WORKSPACE_ID].includes(owner.sId)
  );
}
