import type {
  PokePodFunction,
  PokePodFunctionDetails,
} from "@app/lib/api/poke/projects";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
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
