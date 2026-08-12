import { _getAnalystGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/analyst";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { GROK_4_6_MODEL_CONFIG } from "@app/types/assistant/models/xai";
import type { MembershipRoleType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

async function fetchAnalyst(role: MembershipRoleType, optedOut = false) {
  const { authenticator, workspace, user } = await createResourceTest({ role });
  if (optedOut) {
    await WorkspaceResource.updateMetadata(workspace.id, {
      disableWorkspaceAnalytics: true,
    });
    const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    return getGlobalAgents(refreshedAuth, [GLOBAL_AGENTS_SID.ANALYST], "light");
  }
  return getGlobalAgents(authenticator, [GLOBAL_AGENTS_SID.ANALYST], "light");
}

describe("analyst global agent visibility", () => {
  it("uses Grok 4.6 when xAI is the enabled provider", async () => {
    const workspace = await WorkspaceFactory.enterprise({
      whiteListedProviders: ["xai"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const analyst = _getAnalystGlobalAgent({
      auth,
      featureFlags: ["xai_feature"],
    });

    expect(analyst.model.modelId).toBe(GROK_4_6_MODEL_CONFIG.modelId);
  });

  it("is available to admins by default", async () => {
    const agents = await fetchAnalyst("admin");
    expect(agents).toHaveLength(1);
    expect(agents[0].sId).toBe(GLOBAL_AGENTS_SID.ANALYST);
    expect(agents[0].name).toBe("analyst");
    expect(agents[0].skills).toContain("workspace-analytics");
    expect(agents[0].skills).toContain("frames");
  });

  it("is hidden from admins when the workspace opts out", async () => {
    expect(await fetchAnalyst("admin", true)).toEqual([]);
  });

  it("is hidden from builders even by default", async () => {
    expect(await fetchAnalyst("builder")).toEqual([]);
  });

  it("is hidden from regular users even by default", async () => {
    expect(await fetchAnalyst("user")).toEqual([]);
  });
});
