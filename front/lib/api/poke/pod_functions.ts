import type {
  PokeGetPodFunctionMCPActionOutput,
  PokePodFunction,
  PokePodFunctionDetails,
  PokePodFunctionInvocation,
  PokePodFunctionInvocationDetails,
  PokePodFunctionMCPAction,
} from "@app/lib/api/poke/projects";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  SandboxFunctionInvocationOrigin,
  SandboxFunctionInvocationStatus,
} from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

export async function listProjectPodFunctions(
  auth: Authenticator,
  space: SpaceResource
): Promise<PokePodFunction[]> {
  const sandboxFunctions = await SandboxFunctionResource.listBySpace(
    auth,
    space
  );

  // Resolve all the authors (the user who created each function's file)
  const authorModelIds = removeNulls(
    sandboxFunctions.map((sandboxFunction) => sandboxFunction.file.userId)
  );
  const authors = await UserResource.fetchByModelIds(authorModelIds);

  return sandboxFunctions.map((sandboxFunction) => {
    const author =
      authors.find((user) => user.id === sandboxFunction.file.userId) ?? null;

    return sandboxFunction.toPokeJSON(author);
  });
}

/**
 * Resolves a pod function within a given pod. `SandboxFunctionResource.fetchById` is only
 * workspace-scoped, so the pod check is what keeps a function of another pod from being read
 * through this pod's URL.
 */
export async function fetchProjectPodFunction(
  auth: Authenticator,
  space: SpaceResource,
  podFunctionId: string
): Promise<SandboxFunctionResource | null> {
  const sandboxFunction = await SandboxFunctionResource.fetchById(
    auth,
    podFunctionId
  );
  if (!sandboxFunction || sandboxFunction.spaceId !== space.id) {
    return null;
  }

  return sandboxFunction;
}

export async function getProjectPodFunctionDetails(
  auth: Authenticator,
  sandboxFunction: SandboxFunctionResource
): Promise<PokePodFunctionDetails> {
  const { userId } = sandboxFunction.file;
  const [author] = userId ? await UserResource.fetchByModelIds([userId]) : [];

  return sandboxFunction.toPokeDetailsJSON(author ?? null);
}

export async function listProjectPodFunctionInvocations(
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
): Promise<PokePodFunctionInvocation[]> {
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

/**
 * The published bundle of a pod function. Poke cannot reuse `/poke/:wId/files/:sId` for it: that
 * page only serves `interactive_content` files, and a bundle is a `project_context` one.
 */
export async function getProjectPodFunctionSource(
  auth: Authenticator,
  sandboxFunction: SandboxFunctionResource
): Promise<string> {
  const readStream = sandboxFunction.file.getReadStream({
    auth,
    version: "original",
  });

  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

async function renderMCPActions(
  auth: Authenticator,
  actions: SandboxFunctionMCPActionResource[]
): Promise<PokePodFunctionMCPAction[]> {
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

export async function getProjectPodFunctionInvocation(
  auth: Authenticator,
  {
    sandboxFunction,
    invocationId,
  }: {
    sandboxFunction: SandboxFunctionResource;
    invocationId: string;
  }
): Promise<PokePodFunctionInvocationDetails | null> {
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

export class PodFunctionMCPActionOutputError extends Error {
  constructor(
    readonly type: "action_not_found" | "output_read_failed",
    message: string
  ) {
    super(message);
  }
}

export async function getProjectPodFunctionMCPActionOutput(
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
  Result<PokeGetPodFunctionMCPActionOutput, PodFunctionMCPActionOutputError>
> {
  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
    access: "admin",
  });
  if (!invocation) {
    return new Err(
      new PodFunctionMCPActionOutputError(
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
      new PodFunctionMCPActionOutputError(
        "action_not_found",
        "MCP action not found."
      )
    );
  }

  const outputResult = await action.readOutput();
  if (outputResult.isErr()) {
    return new Err(
      new PodFunctionMCPActionOutputError(
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
