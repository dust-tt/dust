import type { WorkspaceType } from "@dust-tt/types";
import crypto from "crypto";

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
  const hashedWorkspaceId = crypto
    .createHash("md5")
    .update(owner.sId)
    .digest("hex");

  return (
    isDevelopmentOrDustWorkspace(owner) ||
    [
      // Customers workspace.
      // You can find them in the Database with the following query:
      // select * from workspaces where md5("sId") = 'XXX';
      "9904970eeaa283f18656c6e60b66cb19",
      "2ef36b1a3192e9500bfe99e1541c38e1",
      "1d37889d4d9eb29bd24409ad7d183d44",
      "02da873b8c9404f9005d724ea02b84b1",
    ].includes(hashedWorkspaceId)
  );
}
