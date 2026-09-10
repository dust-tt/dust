import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { AgentConfigurationWithSkillsType } from "@app/types/assistant/agent";
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
  }: { agentConfigurations: AgentConfigurationWithSkillsType[] } =
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
  await MembershipFactory.associate(workspace, agentOwner, { role: "user" });
  const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );

  const restrictedSpace = await SpaceFactory.regular(workspace);

  const publishedAgent = await AgentConfigurationFactory.createTestAgent(
    agentOwnerAuth,
    {
      name: "Published Agent",
      scope: "visible",
    }
  );
  await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
    name: "Unpublished Agent",
    scope: "hidden",
  });
  const restrictedSpaceAgent = await AgentConfigurationFactory.createTestAgent(
    agentOwnerAuth,
    {
      name: "Restricted Space Agent",
      scope: "visible",
      requestedSpaceIds: [restrictedSpace.id],
    }
  );

  const skill = await SkillFactory.create(agentOwnerAuth, {
    name: "Support Playbook",
  });
  for (const agent of [publishedAgent, restrictedSpaceAgent]) {
    await SkillFactory.linkToAgent(agentOwnerAuth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });
  }

  return { skill };
}

describe("GET /api/v1/w/[wId]/assistant/agent_configurations", () => {
  it.each([
    "admin",
    "builder",
    "user",
  ] as const)("reports edit permissions for a %s key", async (role) => {
    const { workspace, key } = await createPublicApiMockRequest({ role });
    await setupTestAgents(workspace);

    const response = await listAgents(workspace, key, { view: "all" });
    const {
      agentConfigurations,
    }: { agentConfigurations: AgentConfigurationWithSkillsType[] } =
      await response.json();

    expect(response.status).toBe(200);
    expect(
      agentConfigurations.find((a) => a.name === "Published Agent")?.canEdit
    ).toBe(role === "admin");
    expect(
      agentConfigurations
        .filter((a) => a.scope === "global")
        .every((a) => !a.canEdit)
    ).toBe(true);
  });

  it("returns unpublished and restricted space agents with the all_unrestricted view", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    await setupTestAgents(workspace);

    const response = await listAgents(workspace, key, {
      view: "all_unrestricted",
    });

    expect(response.status).toBe(200);
    const {
      agentConfigurations,
    }: { agentConfigurations: AgentConfigurationWithSkillsType[] } =
      await response.json();
    expect(agentConfigurations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Published Agent", canEdit: true }),
        expect.objectContaining({ name: "Unpublished Agent", canEdit: true }),
        expect.objectContaining({
          name: "Restricted Space Agent",
          canEdit: false,
        }),
      ])
    );
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

  it("returns the skills attached to each agent", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });
    const { skill } = await setupTestAgents(workspace);

    const response = await listAgents(workspace, key, { view: "all" });

    expect(response.status).toBe(200);
    const {
      agentConfigurations,
    }: { agentConfigurations: AgentConfigurationWithSkillsType[] } =
      await response.json();

    const publishedAgent = agentConfigurations.find(
      (a) => a.name === "Published Agent"
    );
    expect(publishedAgent?.skills).toEqual([
      { sId: skill.sId, name: "Support Playbook" },
    ]);

    // Every agent carries the field, so a client can tell "no skills" from "not serialized".
    expect(agentConfigurations.every((a) => Array.isArray(a.skills))).toBe(
      true
    );
  });

  it("rejects the all_unrestricted view for non-admin keys", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "user",
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
