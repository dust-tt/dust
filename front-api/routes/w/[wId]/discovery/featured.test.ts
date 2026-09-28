import { DiscoveryItemResource } from "@app/lib/resources/discovery_item_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/discovery/featured", () => {
  it("returns readable pins with their compact resolved targets", async () => {
    const { auth, workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Featured agent",
    });
    const pinResult = await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId: globalGroup.id,
      item: { type: "agent", itemId: agent.sId, position: 0 },
    });
    if (pinResult.isErr()) {
      throw pinResult.error;
    }

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/discovery/featured`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          type: "agent",
          pin: {
            groupId: globalGroup.sId,
            position: 0,
          },
          target: {
            sId: agent.sId,
            name: "Featured agent",
            description: expect.any(String),
            pictureUrl: expect.any(String),
          },
        },
      ],
    });
  });
});
