import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeAll, describe, expect, it } from "vitest";

function getSpace(workspace: { sId: string }, spaceId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/spaces/${spaceId}`);
}

describe("GET /api/w/:wId/spaces/:spaceId", () => {
  beforeAll(() => {
    process.env.FRONT_DATABASE_READ_REPLICA_URI =
      process.env.FRONT_DATABASE_URI;
  });

  it("reflects real Tools and Triggers usage on the category rows, and shows a Triggers row at all", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const regularSpace = await SpaceFactory.regular(workspace);

    const server = await RemoteMCPServerFactory.create(workspace);
    const mcpServerView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      regularSpace
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Tool User",
      scope: "visible",
    });
    await AgentMCPServerConfigurationFactory.create(auth, regularSpace, {
      agent,
      mcpServerView,
    });

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookView = await webhookSourceViewFactory.create(regularSpace);
    await TriggerFactory.webhook(auth, {
      name: "Trigger User",
      agentConfigurationId: agent.sId,
      status: "enabled",
      configuration: { includePayload: true },
      webhookSourceViewId: Number(webhookView.id),
    });

    const response = await getSpace(workspace, regularSpace.sId);
    expect(response.status).toBe(200);
    const { space } = await response.json();

    expect(space.categories.triggers.count).toBe(1);
    expect(space.categories.triggers.usage.count).toBe(1);
    expect(
      space.categories.triggers.usage.agents.map((a: { sId: string }) => a.sId)
    ).toEqual([agent.sId]);

    expect(space.categories.actions.usage.count).toBe(1);
    expect(
      space.categories.actions.usage.agents.map((a: { sId: string }) => a.sId)
    ).toEqual([agent.sId]);
  });

  it("excludes auto-provisioned tools from the Tools usage row, even in the global space", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    // Auto tools (e.g. Pods, Computer) get a view auto-provisioned into the global space for
    // every workspace — they aren't meaningfully "this space's tools." A skill using one must
    // not inflate the global space's Tools usage row.
    const autoView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "common_utilities"
      );
    assert(autoView, "auto tool view should exist for the global space");

    await SkillFactory.create(auth, {
      name: "Auto Tool Skill",
      availability: "workspace_users",
      mcpServerViews: [autoView],
    });

    const response = await getSpace(workspace, globalSpace.sId);
    expect(response.status).toBe(200);
    const { space } = await response.json();

    expect(space.categories.actions.count).toBe(0);
    expect(space.categories.actions.usage.count).toBe(0);
    expect(space.categories.actions.usage.skills).toEqual([]);
  });
});
