import type { ServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT } from "@app/lib/actions/mcp";
import { buildToolConfigurationsFromRawTools } from "@app/lib/actions/mcp_actions";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import { validateToolInputs } from "@app/lib/actions/mcp_utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { launchSandboxFunctionToolWorkflow } from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import omit from "lodash/omit";

export class SandboxFunctionMCPActionError extends Error {
  constructor(
    readonly type:
      | "server_view_not_found"
      | "tool_not_available"
      | "tool_requires_approval"
      | "invalid_inputs"
      | "invocation_not_found",
    message: string
  ) {
    super(message);
  }
}

// Resolves and gates a tool for execution from a sandbox function invocation: the server must be
// internal (remote servers have their own auth story, excluded for now), the tool must exist and
// be enabled, and its effective stake must be `never_ask` — there is no approval surface without
// a conversation (approval bubbling is gated on invocation durability). Tools that depend on an
// agent-loop context are the servers' responsibility: they error at execution based on the run
// context.
async function resolveSandboxFunctionTool(
  auth: Authenticator,
  view: MCPServerViewResource,
  toolName: string
): Promise<
  Result<ServerSideMCPToolConfigurationType, SandboxFunctionMCPActionError>
> {
  const { serverType } = getServerTypeAndIdFromSId(view.mcpServerId);
  if (serverType !== "internal") {
    return new Err(
      new SandboxFunctionMCPActionError(
        "tool_not_available",
        "This server's tools cannot be called from a sandbox function."
      )
    );
  }

  const viewJSON = view.toJSON();
  const tool = viewJSON.server.tools.find((t) => t.name === toolName);
  if (!tool) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "tool_not_available",
        `Tool ${toolName} not found on server ${viewJSON.server.name}.`
      )
    );
  }

  // View-default server configuration: there is no agent configuration to inject settings from
  // (same synthesized shape as JIT servers, see `jit/common_utilities.ts`).
  const toolConfigurationsRes = await buildToolConfigurationsFromRawTools(
    auth,
    view.mcpServerId,
    {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_server_configuration",
      name: viewJSON.name ?? viewJSON.server.name,
      description: viewJSON.description ?? viewJSON.server.description,
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: viewJSON.sId,
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: view.mcpServerId,
    },
    [{ name: tool.name, description: tool.description }]
  );
  if (toolConfigurationsRes.isErr()) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "tool_not_available",
        toolConfigurationsRes.error.message
      )
    );
  }

  // Empty when the tool has been disabled by an admin.
  const [toolConfiguration] = toolConfigurationsRes.value;
  if (!toolConfiguration) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "tool_not_available",
        `Tool ${toolName} is not available.`
      )
    );
  }

  if (
    toolConfiguration.permission !== "never_ask" ||
    (toolConfiguration.argumentsRequiringApproval ?? []).length > 0
  ) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "tool_requires_approval",
        `Tool ${toolName} requires user approval and cannot be called from a ` +
          "sandbox function."
      )
    );
  }

  return new Ok(toolConfiguration);
}

/**
 * Creates a sandbox function MCP action — code running inside a sandbox function invocation
 * calling an MCP tool through the public sandbox API — and launches its execution workflow.
 */
export async function createSandboxFunctionMCPAction(
  auth: Authenticator,
  {
    sandboxFunctionId,
    invocationId,
    serverViewId,
    toolName,
    rawInputs,
  }: {
    sandboxFunctionId: string;
    invocationId: string;
    serverViewId: string;
    toolName: string;
    rawInputs: Record<string, unknown>;
  }
): Promise<Result<{ actionId: string }, SandboxFunctionMCPActionError>> {
  const view = await MCPServerViewResource.fetchById(auth, serverViewId);
  if (!view) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "server_view_not_found",
        "MCP server view not found."
      )
    );
  }

  const toolConfigurationRes = await resolveSandboxFunctionTool(
    auth,
    view,
    toolName
  );
  if (toolConfigurationRes.isErr()) {
    return toolConfigurationRes;
  }

  const validateInputsResult = validateToolInputs(rawInputs);
  if (validateInputsResult.isErr()) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "invalid_inputs",
        validateInputsResult.error.message
      )
    );
  }

  const sandboxFunction = await SandboxFunctionResource.fetchById(
    auth,
    sandboxFunctionId
  );
  if (!sandboxFunction) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "invocation_not_found",
        "Sandbox function not found."
      )
    );
  }

  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
  });
  if (!invocation) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "invocation_not_found",
        "Sandbox function invocation not found."
      )
    );
  }

  const action = await SandboxFunctionMCPActionResource.makeNew(auth, {
    invocation,
    mcpServerView: view,
    toolName,
    inputs: rawInputs,
    toolConfiguration: omit(
      toolConfigurationRes.value,
      MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT
    ),
  });

  await launchSandboxFunctionToolWorkflow(auth, { action });

  return new Ok({ actionId: action.sId });
}
