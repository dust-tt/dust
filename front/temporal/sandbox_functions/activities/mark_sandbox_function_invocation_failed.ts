import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";

export async function markSandboxFunctionInvocationFailedActivity(
  authType: AuthenticatorType,
  {
    errorMessage,
    sandboxFunctionId,
    invocationId,
  }: {
    errorMessage: string;
    sandboxFunctionId: string;
    invocationId: string;
  }
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);
  // Pipeline resolution: the serialized auth cannot carry the invoker's original grant (e.g. a
  // frame share token); the invocation row is the proof of authorization.
  const sandboxFunction = await SandboxFunctionResource.fetchByIdForPipeline(
    auth,
    sandboxFunctionId,
    { invocationId }
  );
  if (!sandboxFunction) {
    throw new Error(`Pod function not found: ${sandboxFunctionId}`);
  }

  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
    access: "system",
  });
  if (!invocation) {
    throw new Error(`Pod function invocation not found: ${invocationId}`);
  }

  await invocation.markCreatedAsErrored({
    code: "invocation_failed",
    message: errorMessage,
  });
}
