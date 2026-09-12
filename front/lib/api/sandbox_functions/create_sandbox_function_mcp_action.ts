import type { ServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT } from "@app/lib/actions/mcp";
import { buildToolConfigurationsFromRawTools } from "@app/lib/actions/mcp_actions";
import type { SandboxFunctionMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { validateToolInputs } from "@app/lib/actions/mcp_utils";
import { makeMCPApproveExecutionEventBase } from "@app/lib/actions/tool_approval_events";
import { getExecutionStatusFromConfig } from "@app/lib/actions/tool_status";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { buildSandboxFunctionAuditMetadata } from "@app/lib/api/sandbox_functions/audit";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import { launchSandboxFunctionToolWorkflow } from "@app/temporal/sandbox_functions/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import omit from "lodash/omit";

// How long a client idempotency key is remembered. Keys are scoped to the invocation, which is
// itself bounded by the exec timeouts, so this only needs to cover a client retrying a POST whose
// response was lost — 10 minutes matches the dsbx poll cap and is generous for that.
const SANDBOX_ACTION_IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000;

class SandboxFunctionMCPActionError extends Error {
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

// Resolves a tool for execution from a sandbox function invocation. The tool must exist and be
// enabled. Tools that need an agent-loop context error at execution based on the run context.
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
 * calling an MCP tool through the public sandbox API). The workflow is launched immediately when
 * the tool does not require approval; otherwise an approval event is published to the invocation.
 */
export async function createSandboxFunctionMCPAction(
  auth: Authenticator,
  {
    sandboxFunctionId,
    invocationId,
    runtimeSpaceId,
    serverViewId,
    toolName,
    rawInputs,
    idempotencyKey,
  }: {
    sandboxFunctionId: string;
    invocationId: string;
    runtimeSpaceId: string;
    serverViewId: string;
    toolName: string;
    rawInputs: Record<string, unknown>;
    idempotencyKey?: string;
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

  const view = await MCPServerViewResource.fetchById(auth, serverViewId, {
    includeHeavyAttributes: [
      "authorization",
      "cachedTools",
      "customHeaders",
      "lastError",
      "sharedSecret",
    ],
  });
  // `fetchById` is workspace-scoped, so reproduce the listing endpoint's confinement: the view
  // must be in the function's runtime or global space (the spaces the listing queries) AND
  // readable by the caller. The permission check keeps this correct if access is revoked within the token
  // TTL; on its own it would not confine, since an admin can administrate any space. Out-of-scope
  // ids report as not-found so the sandbox cannot probe other spaces.
  const inScope = view?.space.sId === runtimeSpaceId || view?.space.isGlobal();
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

  // Execution-side resolution: a sandbox-token auth cannot carry the invoker's original grant
  // (e.g. a frame share token). The id comes from signature-verified sandbox JWT claims minted
  // at execution start, so the space filter is deliberately skipped.
  const sandboxFunction = await SandboxFunctionResource.fetchByIdForExecution(
    auth,
    {
      sandboxFunctionId,
      invocationId,
    }
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
    access: "system",
  });
  if (!invocation) {
    return new Err(
      new SandboxFunctionMCPActionError(
        "invocation_not_found",
        "Sandbox function invocation not found."
      )
    );
  }

  // Replay: a retried POST carrying the same idempotency key returns the original action instead
  // of creating (and executing) a second one. The client polls the action for its actual state,
  // whatever it is by now — including errored, which is what an honest replay reports.
  //
  // Lookup-then-create is deliberately best-effort: two concurrent POSTs with the same key can
  // both miss and create two actions. The retrying clients replay sequentially, and a unique
  // index would forbid legitimate key reuse after the window.
  if (idempotencyKey !== undefined) {
    const existingAction =
      await SandboxFunctionMCPActionResource.fetchByIdempotencyKey(auth, {
        invocation,
        mcpServerView: view,
        toolName,
        idempotencyKey,
        createdAfter: new Date(
          Date.now() - SANDBOX_ACTION_IDEMPOTENCY_WINDOW_MS
        ),
      });
    if (existingAction) {
      logger.info(
        {
          actionId: existingAction.sId,
          invocationId: invocation.sId,
          toolName,
        },
        "Replayed sandbox function MCP action for idempotency key"
      );
      return new Ok({ actionId: existingAction.sId });
    }
  }

  const toolConfiguration = toolConfigurationRes.value;
  const { status: executionStatus } = await getExecutionStatusFromConfig(auth, {
    actionConfiguration: toolConfiguration,
    context: {
      toolInputs: rawInputs,
    },
  });

  let actionStatus: "running" | "blocked_validation_required";
  switch (executionStatus) {
    case "ready_allowed_implicitly":
      actionStatus = "running";
      break;
    case "blocked_validation_required":
      actionStatus = "blocked_validation_required";
      break;
    default:
      assertNever(executionStatus);
  }

  const action = await SandboxFunctionMCPActionResource.makeNew(auth, {
    invocation,
    mcpServerView: view,
    toolName,
    inputs: rawInputs,
    toolConfiguration: omit(
      toolConfiguration,
      MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT
    ),
    status: actionStatus,
    idempotencyKey,
  });

  switch (actionStatus) {
    case "running": {
      const launchResult = await launchSandboxFunctionToolWorkflow(auth, {
        action,
      });
      if (launchResult.isErr()) {
        await action.updateStatusFromExpected(auth, {
          status: "errored",
          expectedStatus: "running",
        });
        throw launchResult.error;
      }
      break;
    }
    case "blocked_validation_required": {
      const approvalEventBase = await makeMCPApproveExecutionEventBase(auth, {
        actionId: action.sId,
        toolConfiguration,
        inputs: rawInputs,
        approvalSubjectName: sandboxFunction.slug,
      });
      const approvalEvent: SandboxFunctionMCPApproveExecutionEvent = {
        ...approvalEventBase,
        sandboxFunctionId: sandboxFunction.sId,
        invocationId: invocation.sId,
      };

      await publishSandboxFunctionInvocationEvent(approvalEvent, {
        invocationId: invocation.sId,
      });

      void emitAuditLogEvent({
        auth,
        action: "tool.approval_requested",
        targets: [
          buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
          buildAuditLogTarget("tool", {
            sId: toolConfiguration.name,
            name: toolConfiguration.originalName,
          }),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          tool_name: toolConfiguration.originalName,
          mcp_server_name: toolConfiguration.mcpServerName,
          stake_level: toolConfiguration.permission,
          action_id: action.sId,
          ...buildSandboxFunctionAuditMetadata(invocation),
          initiating_user_id: auth.user()?.sId ?? "unknown",
          initiating_user_email: auth.user()?.email ?? "unknown",
        },
      });
      break;
    }
    default:
      assertNever(actionStatus);
  }

  return new Ok({ actionId: action.sId });
}
