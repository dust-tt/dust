import type { Authenticator } from "@app/lib/auth";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

export async function isDustDeepDisabledByAdmin(
  auth: Authenticator
): Promise<boolean> {
  // We cannot call getGlobalAgents here because it will cause a dependency cycle.
  // Can be cached if too many calls are made.
  const settings = await GlobalAgentSettings.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentId: GLOBAL_AGENTS_SID.DUST_DEEP,
    },
  });
  return settings?.status === "disabled_by_admin";
}
