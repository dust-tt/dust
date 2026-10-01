import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getDetails(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/agent_configurations/${aId}/details`
  );
}

describe("GET /api/poke/workspaces/:wId/agent_configurations/:aId/details", () => {
  it("returns each version with its skills", async () => {
    const { workspace, auth } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const skill = await SkillFactory.create(auth, { name: "Linked Skill" });
    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const response = await getDetails(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentConfigurations.map((c: { sId: string }) => c.sId)).toEqual(
      [agent.sId]
    );
    expect(
      data.skillsByVersion[agent.version].map((s: { sId: string }) => s.sId)
    ).toEqual([skill.sId]);
  });

  it("returns the instructions of a hidden agent the superuser does not edit", async () => {
    const { workspace } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden", instructions: "Private instructions." }
    );

    const response = await getDetails(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentConfigurations[0].instructions).toBe(
      "Private instructions."
    );
  });

  it("returns the code-defined skills of a global agent", async () => {
    const { workspace } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await getDetails(workspace, GLOBAL_AGENTS_SID.HELPER);

    expect(response.status).toBe(200);
    const data = await response.json();
    const [version] = data.agentConfigurations;
    expect(
      data.skillsByVersion[version.version].map((s: { sId: string }) => s.sId)
    ).toEqual(["frames"]);
  });

  it("returns 404 for an unknown agent", async () => {
    const { workspace } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await getDetails(workspace, "unknown-agent");

    expect(response.status).toBe(404);
  });
});
