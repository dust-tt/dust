import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import logger from "@app/logger/logger";

/**
 * Record a fast Pod function as durable after it tried to call a Dust tool.
 *
 * The attempt is refused, so the invocation that triggered this still fails: what it buys is that
 * the next one does not. A function reaching this point is mislabelled by definition, since the
 * refusal is the only way to get here, so there is nothing to weigh up.
 *
 * Never awaited by the request that refuses the tool call: the caller has already decided its
 * response, and a slow or failing write here must not hold it up or change what it returns.
 */
export async function selfHealSandboxFunctionExecutionMode(
  auth: Authenticator,
  {
    sandboxFunctionId,
    invocationId,
  }: {
    sandboxFunctionId: string;
    invocationId: string;
  }
): Promise<void> {
  // Execution-side resolution: a sandbox-token auth cannot carry the invoker's original grant
  // (e.g. a frame share token). The id comes from signature-verified sandbox JWT claims minted
  // at execution start, so the space filter is deliberately skipped.
  const sandboxFunction = await SandboxFunctionResource.fetchById(
    auth,
    sandboxFunctionId,
    {
      dangerouslyBypassSpacePermissionFilter: true,
    }
  );
  if (!sandboxFunction) {
    logger.error(
      { sandboxFunctionId, invocationId },
      "Could not find the Pod function to record as durable"
    );
    return;
  }

  const madeDurable = await sandboxFunction.makeDurable(auth);
  if (!madeDurable) {
    // Another invocation got there first, or the publisher already moved it.
    return;
  }

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      sandboxFunctionId,
      invocationId,
      slug: sandboxFunction.slug,
    },
    "Recorded a Pod function as durable after it called a Dust tool as fast"
  );
}
