import {
  redactPrivateAgentConfigurationFields,
  toAgentConfigurationsWithSkills,
} from "@app/lib/api/assistant/configuration/helpers";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

describe("toAgentConfigurationsWithSkills", () => {
  it("serializes the skills attached to each agent", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

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
      await toAgentConfigurationsWithSkills(authenticator, [
        withSkill,
        withoutSkill,
      ]);

    expect(serializedWithSkill.skills).toEqual([
      { sId: skill.sId, name: "Support Playbook" },
    ]);
    // Present but empty, so clients can tell "no skills" from "not serialized".
    expect(serializedWithoutSkill.skills).toEqual([]);
  });

  it("serializes the code-defined skills a global agent declares", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    // Global agents hold no agent-skill row: they name their skills in code, and carry those
    // ids on every variant of their configuration.
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Stands in for a global agent" }
    );

    const [serialized] = await toAgentConfigurationsWithSkills(authenticator, [
      {
        ...agent,
        sId: GLOBAL_AGENTS_SID.DUST,
        codeDefinedSkillIds: ["frames"],
      },
    ]);

    expect(serialized.skills.map((skill) => skill.sId)).toEqual(["frames"]);
    // The raw ids are an internal detail, superseded by `skills`.
    expect("codeDefinedSkillIds" in serialized).toBe(false);
  });

  it("serializes no skills for an agent whose details were redacted", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Redacted" }
    );
    const skill = await SkillFactory.create(authenticator);
    await SkillFactory.linkToAgent(authenticator, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const [serialized] = await toAgentConfigurationsWithSkills(authenticator, [
      redactPrivateAgentConfigurationFields(agent),
    ]);

    expect(serialized.skills).toEqual([]);
  });
});
