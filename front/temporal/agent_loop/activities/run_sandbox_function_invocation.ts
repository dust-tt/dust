import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";

export type RunSandboxFunctionInvocationActivityArgs = {
  invocationId: string;
};

export async function runSandboxFunctionInvocationActivity(
  authType: AuthenticatorType,
  { invocationId }: RunSandboxFunctionInvocationActivityArgs
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);
  const invocation = await SandboxFunctionResource.fetchInvocationById(
    auth,
    invocationId
  );
  if (!invocation) {
    throw new Error(`Sandbox function invocation not found: ${invocationId}`);
  }

  const executionResult = await invocation.execute(auth);
  if (executionResult.isErr()) {
    await invocation.fail(executionResult.error);
    throw executionResult.error;
  }
}
