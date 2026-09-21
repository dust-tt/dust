import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { StoredSandboxFunctionCallError } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  SandboxFunctionInvocationOrigin,
  SandboxFunctionInvocationStatus,
  SandboxFunctionMCPActionType,
} from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Poke's view of sandbox function invocations. An invocation belongs to a `SandboxFunctionResource`
 * and knows nothing about what owns that function, so Pods and Frames share this surface even
 * though they own their function listings separately.
 */

export type PokeSandboxFunctionInvocation = {
  sId: string;
  status: SandboxFunctionInvocationStatus;
  origin: SandboxFunctionInvocationOrigin | null;
  user: string | null;
  createdAt: string;
  updatedAt: string;
  mcpActionCount: number;
};

export type PokeListSandboxFunctionInvocations = {
  items: PokeSandboxFunctionInvocation[];
};

export type PokeSandboxFunctionMCPAction = SandboxFunctionMCPActionType & {
  mcpServerViewId: string | null;
  mcpServerName: string | null;
  hasOutput: boolean;
};

export type PokeSandboxFunctionInvocationDetails =
  PokeSandboxFunctionInvocation & {
    input: unknown;
    result: unknown;
    error: StoredSandboxFunctionCallError | null;
    mcpActions: PokeSandboxFunctionMCPAction[];
  };

export type PokeGetSandboxFunctionInvocation = {
  invocation: PokeSandboxFunctionInvocationDetails;
};

export type PokeGetSandboxFunctionMCPActionOutput = {
  output: CallToolResult["content"] | null;
  // Machine-readable payload of the tool result, when the tool provided one.
  structuredContent?: CallToolResult["structuredContent"];
};

export async function listSandboxFunctionInvocations(
  auth: Authenticator,
  {
    sandboxFunction,
    limit,
    statuses,
    origins,
  }: {
    sandboxFunction: SandboxFunctionResource;
    limit: number;
    statuses?: SandboxFunctionInvocationStatus[];
    origins?: SandboxFunctionInvocationOrigin[];
  }
): Promise<PokeSandboxFunctionInvocation[]> {
  const rows = await SandboxFunctionInvocationResource.listRows(auth, {
    sandboxFunction,
    limit,
    statuses,
    origins,
  });

  const users = await UserResource.fetchByModelIds(
    removeNulls(rows.map((row) => row.userId))
  );
  const usersByModelId = new Map(users.map((user) => [user.id, user]));

  return rows.map((row) =>
    SandboxFunctionInvocationResource.rowToPokeJSON(
      row,
      row.userId !== null ? (usersByModelId.get(row.userId) ?? null) : null
    )
  );
}

async function renderMCPActions(
  auth: Authenticator,
  actions: SandboxFunctionMCPActionResource[]
): Promise<PokeSandboxFunctionMCPAction[]> {
  const mcpServerViews = await MCPServerViewResource.fetchByModelIds(
    auth,
    actions.map((action) => action.mcpServerViewId)
  );
  const mcpServerViewsByModelId = new Map(
    mcpServerViews.map((mcpServerView) => [mcpServerView.id, mcpServerView])
  );

  return actions.map((action) =>
    action.toPokeJSON(
      mcpServerViewsByModelId.get(action.mcpServerViewId) ?? null
    )
  );
}

export async function getSandboxFunctionInvocation(
  auth: Authenticator,
  {
    sandboxFunction,
    invocationId,
  }: {
    sandboxFunction: SandboxFunctionResource;
    invocationId: string;
  }
): Promise<PokeSandboxFunctionInvocationDetails | null> {
  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
    access: "admin",
  });
  if (!invocation) {
    return null;
  }

  const actions = await SandboxFunctionMCPActionResource.listByInvocation(
    auth,
    invocation
  );
  const mcpActions = await renderMCPActions(auth, actions);

  const [user] = invocation.userId
    ? await UserResource.fetchByModelIds([invocation.userId])
    : [];

  return invocation.toPokeJSON(user ?? null, mcpActions);
}

export class SandboxFunctionMCPActionOutputError extends Error {
  constructor(
    readonly type: "action_not_found" | "output_read_failed",
    message: string
  ) {
    super(message);
  }
}

export async function getSandboxFunctionMCPActionOutput(
  auth: Authenticator,
  {
    sandboxFunction,
    invocationId,
    actionId,
  }: {
    sandboxFunction: SandboxFunctionResource;
    invocationId: string;
    actionId: string;
  }
): Promise<
  Result<
    PokeGetSandboxFunctionMCPActionOutput,
    SandboxFunctionMCPActionOutputError
  >
> {
  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
    access: "admin",
  });
  if (!invocation) {
    return new Err(
      new SandboxFunctionMCPActionOutputError(
        "action_not_found",
        "Invocation not found."
      )
    );
  }

  const action = await SandboxFunctionMCPActionResource.fetchById(
    auth,
    actionId
  );
  if (!action || action.sandboxFunctionInvocationId !== invocation.id) {
    return new Err(
      new SandboxFunctionMCPActionOutputError(
        "action_not_found",
        "MCP action not found."
      )
    );
  }

  const outputResult = await action.readOutput();
  if (outputResult.isErr()) {
    return new Err(
      new SandboxFunctionMCPActionOutputError(
        "output_read_failed",
        outputResult.error.message
      )
    );
  }

  const output = outputResult.value;
  return new Ok({
    output: output?.content ?? null,
    ...(output?.structuredContent !== undefined
      ? { structuredContent: output.structuredContent }
      : {}),
  });
}
