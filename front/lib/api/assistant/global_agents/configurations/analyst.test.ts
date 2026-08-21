import { _getAnalystGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/analyst";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { AUTO_MODEL_CONFIG } from "@app/types/assistant/models/auto";
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
  it("uses the Standard auto stream", () => {
    const analyst = _getAnalystGlobalAgent();

    expect(analyst.model.providerId).toBe(AUTO_MODEL_CONFIG.providerId);
    expect(analyst.model.modelId).toBe(AUTO_MODEL_CONFIG.modelId);
    expect(analyst.status).toBe("active");
  });

  it("is available to admins by default", async () => {
    const agents = await fetchAnalyst("admin");
    expect(agents).toHaveLength(1);
    expect(agents[0].sId).toBe(GLOBAL_AGENTS_SID.ANALYST);
    expect(agents[0].name).toBe("analyst");
    expect(agents[0].skills).toContain("workspace-analytics");
    expect(agents[0].skills).toContain("frames");
  });

  it("is available to managers by default", async () => {
    const agents = await fetchAnalyst("manager");
    expect(agents).toHaveLength(1);
    expect(agents[0].sId).toBe(GLOBAL_AGENTS_SID.ANALYST);
  });

  it("is hidden from admins when the workspace opts out", async () => {
    expect(await fetchAnalyst("admin", true)).toEqual([]);
  });

  it("is hidden from managers when the workspace opts out", async () => {
    expect(await fetchAnalyst("manager", true)).toEqual([]);
  });

  it("is hidden from builders even by default", async () => {
    expect(await fetchAnalyst("builder")).toEqual([]);
  });

  it("is hidden from regular users even by default", async () => {
    expect(await fetchAnalyst("user")).toEqual([]);
  });
});
