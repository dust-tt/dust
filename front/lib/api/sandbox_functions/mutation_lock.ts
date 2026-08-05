import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock, LockAcquisitionTimeoutError } from "@app/lib/lock";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const SANDBOX_FUNCTION_MUTATION_LOCK_TIMEOUT_MS = 30_000;
const SANDBOX_FUNCTION_MUTATION_LOCK_TTL_MS = 5 * 60_000;

export async function withSandboxFunctionPublishLock<T>(
  sandboxFunctionId: string,
  mutate: () => Promise<T>
): Promise<T> {
  return executeWithLock(
    `sandbox_function:publish:${sandboxFunctionId}`,
    mutate,
    SANDBOX_FUNCTION_MUTATION_LOCK_TIMEOUT_MS,
    { lockTtlMs: SANDBOX_FUNCTION_MUTATION_LOCK_TTL_MS }
  );
}

export async function withSandboxFunctionMutationLock<T>(
  auth: Authenticator,
  {
    space,
    slug,
    mutate,
  }: {
    space: SpaceResource;
    slug: string;
    mutate: () => Promise<Result<T, SandboxFunctionError>>;
  }
): Promise<Result<T, SandboxFunctionError>> {
  const workspace = auth.getNonNullableWorkspace();
  const lockName = `sandbox_function:mutation:${workspace.sId}:${space.sId}:${slug}`;

  try {
    return await executeWithLock(
      lockName,
      mutate,
      SANDBOX_FUNCTION_MUTATION_LOCK_TIMEOUT_MS,
      { lockTtlMs: SANDBOX_FUNCTION_MUTATION_LOCK_TTL_MS }
    );
  } catch (error) {
    if (error instanceof LockAcquisitionTimeoutError) {
      return new Err(
        new SandboxFunctionError(
          "publish_conflict",
          `Another publish or unpublish is in progress for pod function "${slug}"; retry shortly.`
        )
      );
    }

    return new Err(
      new SandboxFunctionError("internal", normalizeError(error).message)
    );
  }
}
