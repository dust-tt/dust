import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";

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
  const auth = await Authenticator.internalAdminForWorkspace(
    authType.workspaceId
  );

  await SandboxFunctionInvocationResource.markCreatedAsErrored(auth, {
    error: {
      code: "invocation_failed",
      message: errorMessage,
    },
    sandboxFunctionId,
    invocationId,
  });
}
