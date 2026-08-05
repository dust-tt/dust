import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import {
  withSandboxFunctionMutationLock,
  withSandboxFunctionPublishLock,
} from "@app/lib/api/sandbox_functions/mutation_lock";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

interface UnpublishSandboxFunctionResult {
  slug: string;
}

export async function unpublishSandboxFunction(
  auth: Authenticator,
  { space, slug }: { space: SpaceResource; slug: string }
): Promise<Result<UnpublishSandboxFunctionResult, SandboxFunctionError>> {
  return withSandboxFunctionMutationLock(auth, {
    space,
    slug,
    mutate: async () => {
      const sandboxFunction = await SandboxFunctionResource.fetchBySpaceAndSlug(
        auth,
        space,
        slug
      );
      if (!sandboxFunction) {
        return new Err(
          new SandboxFunctionError(
            "not_found",
            `No pod function with slug "${slug}" in this pod.`
          )
        );
      }

      // Keep the legacy per-function lock inside the new pod/slug mutation lock so unpublish also
      // serializes with re-publish requests from an older application version during rollouts.
      const deleteResult = await withSandboxFunctionPublishLock(
        sandboxFunction.sId,
        () => sandboxFunction.delete(auth)
      );
      if (deleteResult.isErr()) {
        return new Err(
          new SandboxFunctionError("internal", deleteResult.error.message)
        );
      }

      return new Ok({ slug: sandboxFunction.slug });
    },
  });
}
