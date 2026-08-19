import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function listAgents(
  workspace: { sId: string },
  key: { secret: string },
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/agent_configurations${qs ? `?${qs}` : ""}`,
    { headers: { authorization: `Bearer ${key.secret}` } }
  );
}

async function agentNames(response: Response): Promise<string[]> {
  const {
    agentConfigurations,
  }: { agentConfigurations: LightAgentConfigurationType[] } =
    await response.json();

  return agentConfigurations.map((a) => a.name);
}

// Creates, as another workspace member, one published agent, one unpublished agent the API key
// is not an editor of, and one published agent requesting a space the API key cannot read.
async function setupTestAgents(workspace: WorkspaceType) {
  const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await SpaceFactory.defaults(internalAdminAuth);

  const agentOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, agentOwner, { role: "builder" });
  const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );

  const restrictedSpace = await SpaceFactory.regular(workspace);

  await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
    name: "Published Agent",
    scope: "visible",
  });
  await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
    name: "Unpublished Agent",
    scope: "hidden",
  });
  await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
    name: "Restricted Space Agent",
    scope: "visible",
    requestedSpaceIds: [restrictedSpace.id],
  });
}

describe("GET /api/v1/w/[wId]/assistant/agent_configurations", () => {
  it("returns unpublished and restricted space agents with the all_unrestricted view", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    await setupTestAgents(workspace);

    const response = await listAgents(workspace, key, {
      view: "all_unrestricted",
    });

    expect(response.status).toBe(200);
    const names = await agentNames(response);
    expect(names).toContain("Published Agent");
    expect(names).toContain("Unpublished Agent");
    expect(names).toContain("Restricted Space Agent");
  });

  it("hides unpublished and restricted space agents with the all view", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    await setupTestAgents(workspace);

    const response = await listAgents(workspace, key, { view: "all" });

    expect(response.status).toBe(200);
    const names = await agentNames(response);
    expect(names).toContain("Published Agent");
    expect(names).not.toContain("Unpublished Agent");
    expect(names).not.toContain("Restricted Space Agent");
  });

  it("rejects the all_unrestricted view for non-admin keys", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "builder",
    });

    const response = await listAgents(workspace, key, {
      view: "all_unrestricted",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only admins can list all agents of the workspace.",
      },
    });
  });
});
