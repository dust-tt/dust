import type { ToolContext } from "@app/lib/actions/types";
import { getSidekickMetadataFromContext } from "@app/lib/api/actions/servers/helpers";

export function getAgentConfigurationIdFromContext(
  toolContext?: ToolContext
): string | null {
  return (
    getSidekickMetadataFromContext(toolContext)
      ?.sidekickTargetAgentConfigurationId ?? null
  );
}

export function getAgentConfigurationVersionFromContext(
  toolContext?: ToolContext
): number | null {
  return (
    getSidekickMetadataFromContext(toolContext)
      ?.sidekickTargetAgentConfigurationVersion ?? null
  );
}
