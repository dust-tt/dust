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
  const sandboxFunction = await SandboxFunctionResource.fetchById(
    auth,
    sandboxFunctionId
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
