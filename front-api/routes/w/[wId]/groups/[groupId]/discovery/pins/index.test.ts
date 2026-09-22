import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function pinsUrl(wId: string, groupId: string, position?: number) {
  const base = `/api/w/${wId}/groups/${groupId}/discovery/pins`;
  return position === undefined ? base : `${base}/${position}`;
}

describe("/api/w/:wId/groups/:groupId/discovery/pins", () => {
  it("sets, lists, and removes a pin", async () => {
    const { auth, workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Pinned agent",
    });

    const putResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId, 1),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "agent", itemId: agent.sId }),
      }
    );
    expect(putResponse.status).toBe(200);
    expect(await putResponse.json()).toEqual({
      item: {
        type: "agent",
        pin: {
          groupId: globalGroup.sId,
          position: 1,
        },
        target: {
          sId: agent.sId,
          name: "Pinned agent",
          description: expect.any(String),
          pictureUrl: expect.any(String),
        },
      },
    });

    const getResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId)
    );
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      items: [
        {
          type: "agent",
          pin: {
            groupId: globalGroup.sId,
            position: 1,
          },
          target: {
            sId: agent.sId,
            name: "Pinned agent",
            description: expect.any(String),
            pictureUrl: expect.any(String),
          },
        },
      ],
    });

    const deleteResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId, 1),
      { method: "DELETE" }
    );
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({ success: true });

    const emptyResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId)
    );
    expect(await emptyResponse.json()).toEqual({ items: [] });
  });

  it("rejects pin management from non-admin users", async () => {
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "manager",
    });

    const getResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId)
    );
    const putResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId, 0),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "agent", itemId: "agt_forbidden" }),
      }
    );
    const deleteResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId, 0),
      { method: "DELETE" }
    );

    expect(getResponse.status).toBe(403);
    expect(putResponse.status).toBe(403);
    expect(deleteResponse.status).toBe(403);
  });

  it("validates positions and target accessibility", async () => {
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const invalidPositionResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId, 3),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "agent", itemId: "agt_missing" }),
      }
    );
    expect(invalidPositionResponse.status).toBe(400);

    const missingTargetResponse = await honoApp.request(
      pinsUrl(workspace.sId, globalGroup.sId, 0),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "agent", itemId: "agt_missing" }),
      }
    );
    expect(missingTargetResponse.status).toBe(400);
    expect((await missingTargetResponse.json()).error.type).toBe(
      "invalid_request_error"
    );
  });
});
