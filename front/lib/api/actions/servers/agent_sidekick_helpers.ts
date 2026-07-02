import type { ToolContextType } from "@app/lib/actions/types";
import { getSidekickMetadataFromContext } from "@app/lib/api/actions/servers/helpers";

export function getAgentConfigurationIdFromContext(
  toolContext?: ToolContextType
): string | null {
  return (
    getSidekickMetadataFromContext(toolContext)
      ?.sidekickTargetAgentConfigurationId ?? null
  );
}

export function getAgentConfigurationVersionFromContext(
  toolContext?: ToolContextType
): number | null {
  return (
    getSidekickMetadataFromContext(toolContext)
      ?.sidekickTargetAgentConfigurationVersion ?? null
  );
}
