import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getTriggerDetails(workspace: { sId: string }, tId: string) {
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/triggers/${tId}/details`
  );
}

describe("GET /api/poke/workspaces/:wId/triggers/:tId/details", () => {
  it("returns the trigger with its agent's full configuration", async () => {
    const { workspace, auth } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      instructions: "Run every morning.",
    });
    const trigger = await TriggerFactory.schedule(auth, {
      agentConfigurationId: agent.sId,
      configuration: { type: "cron", cron: "0 9 * * *", timezone: "UTC" },
    });

    const response = await getTriggerDetails(workspace, trigger.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.trigger.sId).toBe(trigger.sId);
    expect(data.agent).toMatchObject({
      sId: agent.sId,
      instructions: "Run every morning.",
      actions: [],
    });
  });

  it("returns 404 for an unknown trigger", async () => {
    const { workspace } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await getTriggerDetails(workspace, "unknown-trigger");

    expect(response.status).toBe(404);
  });
});
