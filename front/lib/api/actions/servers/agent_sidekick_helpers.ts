import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolContext } from "@app/lib/actions/types";
import { getSidekickMetadataFromContext } from "@app/lib/api/actions/servers/helpers";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function requireSidekickTargetAgentId(
  toolContext?: ToolContext
): Result<string, MCPError> {
  const agentConfigurationId =
    getSidekickMetadataFromContext(
      toolContext
    )?.sidekickTargetAgentConfigurationId;

  if (!agentConfigurationId) {
    return new Err(
      new MCPError(
        "Target agent not found in the conversation metadata. This tool only works in a " +
          "sidekick conversation about an agent.",
        { tracked: false }
      )
    );
  }

  return new Ok(agentConfigurationId);
}

export function getAgentConfigurationVersionFromContext(
  toolContext?: ToolContext
): number | null {
  return (
    getSidekickMetadataFromContext(toolContext)
      ?.sidekickTargetAgentConfigurationVersion ?? null
  );
}

/**
 * @cc [owner:avervaet,label:product] directive-syntax
 * The returned string MUST be exactly `:agent_suggestion[]{sId=<sId> kind=<kind>}`: the
 * conversation markdown renderer only turns that syntax into a suggestion card.
 */
export function formatAgentSuggestionDirective({
  sId,
  kind,
}: {
  sId: string;
  kind: string;
}): string {
  return `:agent_suggestion[]{sId=${sId} kind=${kind}}`;
}
