import type { ServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT } from "@app/lib/actions/mcp";
import { buildToolConfigurationsFromRawTools } from "@app/lib/actions/mcp_actions";
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
      | "invalid_inputs"
      | "invocation_not_found",
    message: string
  ) {
    super(message);
  }
}

// Resolves a tool for execution from a sandbox function invocation: the tool must exist and be
// enabled. The tool's stake is snapshotted but not enforced yet: tools execute regardless of it.
// TODO(2026-07-09 SANDBOX_FUNCTIONS): bubble approval events up from the frame instead, honoring
// stakes (gated on invocation durability). Tools that need an agent-loop context error at
// execution based on the run context.
async function resolveSandboxFunctionTool(
  auth: Authenticator,
  view: MCPServerViewResource,
  toolName: string
): Promise<
  Result<ServerSideMCPToolConfigurationType, SandboxFunctionMCPActionError>
> {
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
      // Null for remote servers, matching the agent path (see `configuration/actions.ts`).
      internalMCPServerId: view.internalMCPServerId,
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

  return new Ok(toolConfiguration);
}

/**
 * Creates a sandbox function MCP action (code running inside a sandbox function invocation
 * calling an MCP tool through the public sandbox API) and launches its execution workflow.
 */
export async function createSandboxFunctionMCPAction(
  auth: Authenticator,
  {
    sandboxFunctionId,
    invocationId,
    podSpaceId,
    serverViewId,
    toolName,
    rawInputs,
  }: {
    sandboxFunctionId: string;
    invocationId: string;
    podSpaceId: string;
    serverViewId: string;
    toolName: string;
    rawInputs: Record<string, unknown>;
  }
): Promise<Result<{ actionId: string }, SandboxFunctionMCPActionError>> {
  const validateInputsResult = validateToolInputs(rawInputs);
  if (validateInputsResult.isErr()) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "invalid_inputs",
        validateInputsResult.error.message
      )
    );
  }

  const view = await MCPServerViewResource.fetchById(auth, serverViewId);
  // `fetchById` is workspace-scoped, so reproduce the listing endpoint's confinement: the view
  // must be in the pod or global space (the spaces the listing queries) AND readable by the
  // caller. The permission check keeps this correct if pod access is revoked within the token
  // TTL; on its own it would not confine, since an admin can administrate any space. Out-of-scope
  // ids report as not-found so the sandbox cannot probe other spaces.
  const inScope = view?.space.sId === podSpaceId || view?.space.isGlobal();
  if (!view || !inScope || !view.canReadOrAdministrate(auth)) {
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
