import { describe, expect, it } from "vitest";

import { TriggerModel } from "@app/lib/models/assistant/triggers/triggers";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";

import { getWebhookSourcesUsage } from "./agent_triggers";

describe("getWebhookSourcesUsage", () => {
  it("returns webhook source usage for accessible agents", async () => {
    const { workspace, authenticator, systemSpace, user } =
      await createResourceTest({
        role: "admin",
      });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Agent One",
      }
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const systemView = await webhookSourceViewFactory.create(systemSpace);

    const webhookSourceViewId = Number(systemView.id);
    const webhookSourceId = Number(systemView.webhookSourceId);

    await TriggerModel.create({
      workspaceId: workspace.id,
      name: "Webhook Usage Trigger",
      kind: "webhook",
      agentConfigurationId: agent.sId,
      editor: user.id,
      customPrompt: null,
      enabled: true,
      configuration: { includePayload: true },
      webhookSourceViewId,
    });

    const usage = await getWebhookSourcesUsage({ auth: authenticator });

    expect(Object.keys(usage)).toEqual([String(webhookSourceId)]);
    expect(usage[webhookSourceId]).toEqual({
      count: 1,
      agents: [
        {
          sId: agent.sId,
          name: agent.name,
        },
      ],
    });
  });

  it("returns empty usage when trigger references no accessible agent", async () => {
    const { workspace, authenticator, systemSpace, user } =
      await createResourceTest({
        role: "admin",
      });

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const systemView = await webhookSourceViewFactory.create(systemSpace);

    const webhookSourceViewId = Number(systemView.id);

    await TriggerModel.create({
      workspaceId: workspace.id,
      name: "Orphan Trigger",
      kind: "webhook",
      agentConfigurationId: "non-existent-agent",
      editor: user.id,
      customPrompt: null,
      enabled: true,
      configuration: { includePayload: true },
      webhookSourceViewId,
    });

    const usage = await getWebhookSourcesUsage({ auth: authenticator });

    expect(usage).toEqual({});
  });

  it("aggregates multiple agents linked to the same webhook source", async () => {
    const { workspace, authenticator, systemSpace, user } =
      await createResourceTest({
        role: "admin",
      });

    const agentBeta = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Beta Agent",
      }
    );
    const agentAlpha = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Alpha Agent",
      }
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const systemView = await webhookSourceViewFactory.create(systemSpace);

    const webhookSourceViewId = Number(systemView.id);
    const webhookSourceId = Number(systemView.webhookSourceId);

    await TriggerModel.create({
      workspaceId: workspace.id,
      name: "Webhook Usage Trigger Beta",
      kind: "webhook",
      agentConfigurationId: agentBeta.sId,
      editor: user.id,
      customPrompt: null,
      enabled: true,
      configuration: { includePayload: true },
      webhookSourceViewId,
    });

    await TriggerModel.create({
      workspaceId: workspace.id,
      name: "Webhook Usage Trigger Alpha",
      kind: "webhook",
      agentConfigurationId: agentAlpha.sId,
      editor: user.id,
      customPrompt: null,
      enabled: true,
      configuration: { includePayload: true },
      webhookSourceViewId,
    });

    const usage = await getWebhookSourcesUsage({ auth: authenticator });

    expect(usage[webhookSourceId]).toEqual({
      count: 2,
      agents: [
        {
          sId: agentAlpha.sId,
          name: agentAlpha.name,
        },
        {
          sId: agentBeta.sId,
          name: agentBeta.name,
        },
      ],
    });
  });
});
