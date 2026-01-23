import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { isDeepDiveDisabledByAdmin } from "@app/lib/api/assistant/global_agents/configurations/dust/utils";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";

export const isEnabledForWorkspace = async (
  auth: Authenticator,
  name: InternalMCPServerNameType
): Promise<boolean> => {
  const mcpServer = INTERNAL_MCP_SERVERS[name];

  // If the server has a restriction, check if the restrictions are met.
  if (mcpServer.isRestricted) {
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
    const plan = auth.getNonNullablePlan();
    const isDeepDiveDisabled = await isDeepDiveDisabledByAdmin(auth);

    return !mcpServer.isRestricted({
      plan,
      featureFlags,
      isDeepDiveDisabled,
    });
  }

  // If the server has no restriction, it is available by default.
  return true;
};
