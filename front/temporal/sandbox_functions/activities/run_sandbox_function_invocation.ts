import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";

export async function runSandboxFunctionInvocationActivity(
  authType: AuthenticatorType,
  {
    sandboxFunctionId,
    invocationId,
  }: {
    sandboxFunctionId: string;
    invocationId: string;
  }
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);
  // Execution-side resolution: the serialized auth cannot carry the invoker's original grant
  // (e.g. a frame share token). The ids come from workflow args our own launch code minted after
  // the caller-facing gates passed, so the space filter is deliberately skipped.
  const sandboxFunction = await SandboxFunctionResource.fetchByIdForExecution(
    auth,
    {
      sandboxFunctionId,
      invocationId,
    }
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

  const executionResult = await invocation.execute(auth);
  if (executionResult.isErr()) {
    await invocation.fail(executionResult.error);
    throw executionResult.error;
  }
}
