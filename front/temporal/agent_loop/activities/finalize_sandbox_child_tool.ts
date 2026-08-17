import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ModelId } from "@app/types/shared/model_id";

export async function finalizeErroredSandboxChildToolActivity(
  authType: AuthenticatorType,
  { actionModelId }: { actionModelId: ModelId }
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);
  const action = await AgentMCPActionResource.fetchByModelIdWithAuth(
    auth,
    actionModelId
  );

  if (
    !action ||
    !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
  ) {
    return;
  }

  await action.updateStatusFromExpected(auth, {
    expectedStatus: "running",
    status: "errored",
  });
}
