import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import {
  getSandboxFunctionPublishLockName,
  SandboxFunctionResource,
} from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface UnpublishSandboxFunctionResult {
  slug: string;
}

export async function unpublishSandboxFunction(
  auth: Authenticator,
  { space, slug }: { space: SpaceResource; slug: string }
): Promise<Result<UnpublishSandboxFunctionResult, SandboxFunctionError>> {
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

  try {
    const deleteResult = await executeWithLock(
      getSandboxFunctionPublishLockName(sandboxFunction.sId),
      () => sandboxFunction.delete(auth),
      30_000,
      { lockTtlMs: 5 * 60_000 }
    );
    if (deleteResult.isErr()) {
      return new Err(
        new SandboxFunctionError("internal", deleteResult.error.message)
      );
    }

    return new Ok({ slug: sandboxFunction.slug });
  } catch (error) {
    return new Err(
      new SandboxFunctionError("internal", normalizeError(error).message)
    );
  }
}
