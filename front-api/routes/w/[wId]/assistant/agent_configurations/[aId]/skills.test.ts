import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getSkills(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/skills`
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/skills", () => {
  it("should return 200 with empty array when agent has no skills", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await getSkills(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("skills");
    expect(data.skills).toBeInstanceOf(Array);
    expect(data.skills).toHaveLength(0);
  });

  it("should return 200 with skills when agent has skills", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const skill1 = await SkillFactory.create(auth, {
      name: "Test Skill 1",
      agentFacingDescription: "First test skill",
    });
    const skill2 = await SkillFactory.create(auth, {
      name: "Test Skill 2",
      agentFacingDescription: "Second test skill",
    });

    await SkillFactory.linkToAgent(auth, {
      skillId: skill1.id,
      agentConfigurationId: agent.id,
    });
    await SkillFactory.linkToAgent(auth, {
      skillId: skill2.id,
      agentConfigurationId: agent.id,
    });

    const response = await getSkills(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skills).toHaveLength(2);
    expect(data.skills[0]).toHaveProperty("sId");
    expect(data.skills[0]).toHaveProperty("name");
    expect(data.skills[0]).toHaveProperty("agentFacingDescription");

    const skillNames = data.skills.map((s: SkillType) => s.name);
    expect(skillNames).toContain("Test Skill 1");
    expect(skillNames).toContain("Test Skill 2");
  });

  it("should return 404 when agent does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

    const response = await getSkills(workspace, "non_existent_agent_sId");

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  });

  it("should only return skills from the correct workspace", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const skill = await SkillFactory.create(auth, { name: "Workspace Skill" });
    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const response = await getSkills(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skills).toHaveLength(1);
    expect(data.skills[0].name).toBe("Workspace Skill");
  });

  it("should work for builder roles (builder, admin)", async () => {
    for (const role of ["builder", "admin"] as const) {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: role as MembershipRoleType,
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const agent = await AgentConfigurationFactory.createTestAgent(auth);
      const skill = await SkillFactory.create(auth, {
        name: `Skill for ${role}`,
      });
      await SkillFactory.linkToAgent(auth, {
        skillId: skill.id,
        agentConfigurationId: agent.id,
      });

      const response = await getSkills(workspace, agent.sId);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.skills).toHaveLength(1);
      expect(data.skills[0].name).toBe(`Skill for ${role}`);
    }
  });
});
