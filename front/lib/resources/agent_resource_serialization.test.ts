import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { toAgentConfigurationsWithSkills } from "@app/lib/resources/agent_resource_serialization";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

describe("toAgentConfigurationsWithSkills", () => {
  it("serializes the skills attached to each agent", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });

    const [withSkill, withoutSkill] = await Promise.all([
      AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "With skill",
      }),
      AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "Without skill",
      }),
    ]);
    const skill = await SkillFactory.create(authenticator, {
      name: "Support Playbook",
    });
    await SkillFactory.linkToAgent(authenticator, {
      skillId: skill.id,
      agentConfigurationId: withSkill.id,
    });

    const [serializedWithSkill, serializedWithoutSkill] =
      await toAgentConfigurationsWithSkills(
        authenticator,
        await AgentResource.fetchByIds(authenticator, [
          withSkill.sId,
          withoutSkill.sId,
        ])
      );

    expect(serializedWithSkill.skills).toEqual([
      { sId: skill.sId, name: "Support Playbook" },
    ]);
    // Present but empty, so clients can tell "no skills" from "not serialized".
    expect(serializedWithoutSkill.skills).toEqual([]);
  });

  it("serializes the code-defined skills a global agent declares, not their raw ids", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });

    const [serialized] = await toAgentConfigurationsWithSkills(
      authenticator,
      await AgentResource.fetchByIds(authenticator, [GLOBAL_AGENTS_SID.HELPER]),
      { variant: "full" }
    );

    expect(serialized.skills.map((skill) => skill.sId)).toEqual(["frames"]);
    expect("codeDefinedSkillIds" in serialized).toBe(false);
  });

  it("serializes no skills for an agent the caller cannot read", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Restricted", requestedSpaceIds: [restrictedSpace.id] }
    );
    const skill = await SkillFactory.create(authenticator);
    await SkillFactory.linkToAgent(authenticator, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );
    const resources = await AgentResource.fetchByIds(adminAuth, [agent.sId]);
    expect(resources).toHaveLength(1);
    expect(adminAuth.can("read", resources[0])).toBe(false);

    const [serialized] = await toAgentConfigurationsWithSkills(
      adminAuth,
      resources
    );

    expect(serialized.skills).toEqual([]);
  });
});
