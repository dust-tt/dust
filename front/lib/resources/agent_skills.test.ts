import { AgentResource } from "@app/lib/resources/agent_resource";
import { launchAgentSearchIndexation } from "@app/lib/resources/agent_resource_indexation";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

// The mutations run inside the per-test transaction, whose after-commit hooks never fire.
vi.mock(
  import("@app/lib/resources/agent_resource_indexation"),
  async (importOriginal) => {
    const original = await importOriginal();
    return {
      ...original,
      launchAgentSearchIndexation: vi.fn(original.launchAgentSearchIndexation),
    };
  }
);

describe("agent skill cascade", () => {
  it("reindexes the agents using a skill when its status changes or it is deleted", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth);
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent using the skill",
    });
    await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent without the skill",
    });
    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const mutations = [
      () => skill.archive(auth),
      () => skill.restore(auth),
      () =>
        skill.updateSkill(auth, {
          name: skill.name,
          agentFacingDescription: skill.agentFacingDescription,
          userFacingDescription: skill.userFacingDescription,
          instructions: skill.instructions,
          instructionsHtml: skill.instructionsHtml,
          icon: skill.icon,
          mcpServerViews: [],
          attachedKnowledge: [],
          manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
          requestedSpaceIds: skill.requestedSpaceIds,
          status: "archived",
        }),
      () => skill.delete(auth),
    ];
    for (const mutate of mutations) {
      vi.mocked(launchAgentSearchIndexation).mockClear();
      await mutate();
      expect(launchAgentSearchIndexation).toHaveBeenCalledWith(
        workspace.sId,
        [agent.sId],
        expect.anything()
      );
    }

    const resource = await AgentResource.fetchById(auth, agent.sId);
    assert(resource !== null);
    expect(await resource.listSkills(auth)).toEqual([]);
  });
});
