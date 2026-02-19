import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it } from "vitest";

import handler from "./create-pending";

describe("POST /api/w/[wId]/assistant/agent_configurations/create-pending", () => {
  it("creates a pending agent and returns sId, pending agent has correct status and placeholder values", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response).toHaveProperty("sId");
    expect(typeof response.sId).toBe("string");
    expect(response.sId.length).toBeGreaterThan(0);

    const { sId } = response;

    // Verify the agent was created in the database
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

  it("returns 405 for non-POST methods", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });
});
