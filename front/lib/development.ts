import type { WorkspaceType } from "@dust-tt/types";
import { isDevelopment } from "@dust-tt/types";
import { EnvironmentConfig } from "@dust-tt/types";

export function isDevelopmentOrDustWorkspace(owner: WorkspaceType) {
  return (
    isDevelopment() ||
    owner.sId ===
      EnvironmentConfig.getEnvVariable("PRODUCTION_DUST_WORKSPACE_ID") ||
    owner.sId ===
      EnvironmentConfig.getEnvVariable("PRODUCTION_DUST_APPS_WORKSPACE_ID")
  );
}
