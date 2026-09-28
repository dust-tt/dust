import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function patchLinkedSlackChannels(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/linked_slack_channels`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slack_channel_internal_ids: ["C123"],
        provider: "slack",
      }),
    }
  );
}

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId/linked_slack_channels", () => {
  let linkSlackChannelsWithAgent: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(DataSourceResource, "listByConnectorProvider").mockResolvedValue([
      { connectorId: "1" } as DataSourceResource,
    ]);
    linkSlackChannelsWithAgent = vi
      .spyOn(ConnectorsAPI.prototype, "linkSlackChannelsWithAgent")
      .mockResolvedValue(new Ok({ success: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("links the channels for an editor of the agent", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await patchLinkedSlackChannels(workspace, agent.sId);

    expect(response.status).toBe(200);
    expect(linkSlackChannelsWithAgent).toHaveBeenCalledTimes(1);
  });

  it("rejects a workspace admin who is not an editor of the agent", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "visible" }
    );

    const response = await patchLinkedSlackChannels(workspace, agent.sId);

    expect(response.status).toBe(403);
    expect(linkSlackChannelsWithAgent).not.toHaveBeenCalled();
  });
});
