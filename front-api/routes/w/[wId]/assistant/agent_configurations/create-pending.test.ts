import { describe, expect, it } from "vitest";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import { honoApp } from "@front-api/app";

function createPending(workspace: { sId: string }) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/create-pending`,
    { method: "POST" }
  );
}

describe("POST /api/w/:wId/assistant/agent_configurations/create-pending", () => {
  it("creates a pending agent and returns sId; pending agent has correct status and placeholder values", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
    });

    const response = await createPending(workspace);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("sId");
    expect(typeof body.sId).toBe("string");
    expect(body.sId.length).toBeGreaterThan(0);

    const { sId } = body;
    const agent = await AgentConfigurationModel.findOne({
      where: { sId, workspaceId: workspace.id },
    });

    expect(agent).not.toBeNull();
    expect(agent!.status).toBe("pending");
    expect(agent!.scope).toBe("hidden");
    expect(agent!.name).toBe("__PENDING__");
    expect(agent!.description).toBe("");
    expect(agent!.workspaceId).toBe(workspace.id);
    expect(agent!.authorId).toBe(user.id);
    expect(agent!.version).toBe(0);
  });
});
