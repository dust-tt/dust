import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup() {
  const { workspace, key } = await createPublicApiMockRequest({
    role: "admin",
  });
  await SpaceFactory.defaults(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  return { workspace, key, auth };
}

function search(
  workspace: { sId: string },
  key: { secret: string },
  q: string
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/agent_configurations/search?q=${q}`,
    { headers: { authorization: `Bearer ${key.secret}` } }
  );
}

describe("GET /api/v1/w/:wId/assistant/agent_configurations/search", () => {
  it("returns the published agents whose name contains the query", async () => {
    const { workspace, key, auth } = await setup();
    for (const [name, scope] of [
      ["Sales Helper", "visible"],
      ["Pre-sales Desk", "visible"],
      ["Hidden Sales", "hidden"],
      ["Support", "visible"],
    ] as const) {
      await AgentConfigurationFactory.createTestAgent(auth, { name, scope });
    }

    const response = await search(workspace, key, "sales");

    expect(response.status).toBe(200);
    const { agentConfigurations } = await response.json();
    expect(
      agentConfigurations.map((a: { name: string }) => a.name).sort()
    ).toEqual(["Pre-sales Desk", "Sales Helper"]);
    for (const agentConfiguration of agentConfigurations) {
      expect(agentConfiguration).toMatchObject({
        actions: [],
        instructionsHtml: null,
      });
    }
  });

  it("returns the skills of the matched agents", async () => {
    const { workspace, key, auth } = await setup();
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Searchable",
      scope: "visible",
    });
    const skill = await SkillFactory.create(auth, { name: "Linked Skill" });
    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const response = await search(workspace, key, "Search");

    expect(response.status).toBe(200);
    const { agentConfigurations } = await response.json();
    expect(agentConfigurations).toHaveLength(1);
    expect(agentConfigurations[0]).toMatchObject({
      sId: agent.sId,
      skills: [{ sId: skill.sId, name: "Linked Skill" }],
    });
  });
});
