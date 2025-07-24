import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { MCPConfigurationServerRunner } from "@app/lib/actions/mcp";
import { hideInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type {
  BaseActionRunParams,
} from "@app/lib/actions/types";
import type { ActionConfigurationType, AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Ok } from "@app/types";

/**
 * Builds a tool specification for the given MCP action configuration.
 * This replaces the buildSpecification method from the runner pattern.
 */
export async function buildToolSpecification(
  auth: Authenticator,
  actionConfiguration: MCPToolConfigurationType
): Promise<Result<AgentActionSpecification, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      "Unexpected unauthenticated call to `buildToolSpecification`"
    );
  }

  // Filter out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.TOOL_INPUT
  const filteredInputSchema = hideInternalConfiguration(
    actionConfiguration.inputSchema
  );

  return new Ok({
    name: actionConfiguration.name,
    description: actionConfiguration.description ?? "",
    inputs: [],
    inputSchema: filteredInputSchema,
  });
}

/**
 * Runs a tool with streaming for the given MCP action configuration.
 * This replaces the run method from the runner pattern.
 */
export async function* runToolWithStreaming(
  auth: Authenticator,
  actionConfiguration: MCPToolConfigurationType,
  runParams: BaseActionRunParams & {
    stepActionIndex: number;
    stepActions: ActionConfigurationType[];
    citationsRefsOffset: number;
  }
) {
  const runner = new MCPConfigurationServerRunner(actionConfiguration);
  yield* runner.run(auth, runParams);
}
