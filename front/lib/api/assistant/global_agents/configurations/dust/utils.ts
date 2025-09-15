import type { Authenticator } from "@app/lib/auth";
import { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

export async function isDustDeepDisabledByAdmin(
  auth: Authenticator
): Promise<boolean> {
  // We cannot call getGlobalAgents here because it will cause a dependency cycle.
  const settings = await GlobalAgentSettings.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentId: GLOBAL_AGENTS_SID.DUST_DEEP,
    },
  });
  return settings.length > 0 && settings[0].status === "disabled_by_admin";
}
