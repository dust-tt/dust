import type { PokePodFunction } from "@app/lib/api/poke/projects";
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
