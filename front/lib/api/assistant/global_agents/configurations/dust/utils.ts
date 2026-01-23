import memoizer from "lru-memoizer";

import type { Authenticator } from "@app/lib/auth";
import { GlobalAgentSettingsModel } from "@app/lib/models/agent/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

export const isDeepDiveDisabledByAdmin = memoizer.sync({
  load: async (auth: Authenticator): Promise<boolean> => {
    // We cannot call getGlobalAgents here because it will cause a dependency cycle.
    // Can be cached if too many calls are made.
    const settings = await GlobalAgentSettingsModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentId: GLOBAL_AGENTS_SID.DEEP_DIVE,
      },
    });
    return settings?.status === "disabled_by_admin";
  },

  hash: function (auth: Authenticator) {
    return `deep_dive_disabled_by_admin_${auth.getNonNullableWorkspace().id}`;
  },

  itemMaxAge: () => 3000,
});
