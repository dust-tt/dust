import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import type { WorkspaceType } from "@app/types/user";
import assert from "assert";
import { describe, expect, it } from "vitest";

import {
  createAgentTrigger,
  deleteAgentTriggers,
  getWebhookSourcesUsage,
} from "./agent_triggers";

const CRON_CONFIGURATION = {
  type: "cron" as const,
  cron: "0 9 * * *",
  timezone: "UTC",
};

async function createMemberAuth(
  workspace: WorkspaceType,
  role: "user" | "admin"
): Promise<Authenticator> {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role });
  return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
}

describe("getWebhookSourcesUsage", () => {
  it("returns webhook source usage for accessible agents", async () => {
    const { workspace, authenticator, systemSpace } = await createResourceTest({
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

    await TriggerFactory.webhook(authenticator, {
      name: "Webhook Usage Trigger",
      agentConfigurationId: agent.sId,
      status: "enabled",
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
          pictureUrl: agent.pictureUrl,
        },
      ],
    });
  });

  it("returns empty usage when trigger references no accessible agent", async () => {
    const { workspace, authenticator, systemSpace } = await createResourceTest({
      role: "admin",
    });

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const systemView = await webhookSourceViewFactory.create(systemSpace);

    const webhookSourceViewId = Number(systemView.id);

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Archived Agent" }
    );

    await TriggerFactory.webhook(authenticator, {
      name: "Orphan Trigger",
      agentConfigurationId: agent.sId,
      status: "enabled",
      configuration: { includePayload: true },
      webhookSourceViewId,
    });

    const agentResource = await AgentResource.fetchById(
      authenticator,
      agent.sId
    );
    assert(agentResource);
    expect((await agentResource.archive(authenticator)).isOk()).toBe(true);

    const usage = await getWebhookSourcesUsage({ auth: authenticator });

    expect(usage).toEqual({});
  });

  it("aggregates multiple agents linked to the same webhook source", async () => {
    const { workspace, authenticator, systemSpace } = await createResourceTest({
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

    await TriggerFactory.webhook(authenticator, {
      name: "Webhook Usage Trigger Beta",
      agentConfigurationId: agentBeta.sId,
      status: "enabled",
      configuration: { includePayload: true },
      webhookSourceViewId,
    });

    await TriggerFactory.webhook(authenticator, {
      name: "Webhook Usage Trigger Alpha",
      agentConfigurationId: agentAlpha.sId,
      status: "enabled",
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
          pictureUrl: agentAlpha.pictureUrl,
        },
        {
          sId: agentBeta.sId,
          name: agentBeta.name,
          pictureUrl: agentBeta.pictureUrl,
        },
      ],
    });
  });
});

describe("createAgentTrigger", () => {
  it("makes the caller the editor, whatever the input says", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
      plan: "creditPriced",
    });
    const otherAuth = await createMemberAuth(workspace, "user");
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const agent = await AgentResource.fetchById(
      authenticator,
      agentConfiguration.sId
    );
    assert(agent, "Agent not found");

    const res = await createAgentTrigger(authenticator, {
      agent,
      trigger: {
        name: "Daily digest",
        kind: "schedule",
        status: "disabled",
        customPrompt: "Send the digest.",
        naturalLanguageDescription: "every day at 9am",
        configuration: CRON_CONFIGURATION,
        editor: otherAuth.getNonNullableUser().id,
      },
      origin: "agent",
    });

    assert(res.isOk(), "Trigger creation failed");
    expect(res.value.editor).toBe(authenticator.getNonNullableUser().id);
    expect(res.value.origin).toBe("agent");
  });

  it("rejects a webhook source view in a space the caller cannot access", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
      plan: "creditPriced",
    });
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const agent = await AgentResource.fetchById(
      authenticator,
      agentConfiguration.sId
    );
    assert(agent, "Agent not found");
    const view = await new WebhookSourceViewFactory(workspace).create(
      await SpaceFactory.regular(workspace)
    );

    const res = await createAgentTrigger(authenticator, {
      agent,
      trigger: {
        name: "On event",
        kind: "webhook",
        status: "disabled",
        customPrompt: "",
        naturalLanguageDescription: null,
        configuration: { includePayload: true },
        webhookSourceViewId: view.sId,
        executionPerDayLimitOverride: 42,
      },
      origin: "user",
    });

    assert(res.isErr(), "Trigger creation should fail");
    expect(res.error.code).toBe("webhook_source_not_found");
    expect(
      await TriggerResource.listByAgentConfigurationId(authenticator, agent.sId)
    ).toEqual([]);
  });
});

describe("deleteAgentTriggers", () => {
  it("only deletes the caller's own triggers and skips unknown ids", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "user",
      plan: "creditPriced",
    });
    const otherAuth = await createMemberAuth(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(authenticator);
    const ownTrigger = await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      configuration: CRON_CONFIGURATION,
    });
    const otherTrigger = await TriggerFactory.schedule(otherAuth, {
      agentConfigurationId: agent.sId,
      configuration: CRON_CONFIGURATION,
    });

    const res = await deleteAgentTriggers(authenticator, {
      agentId: agent.sId,
      triggerIds: [ownTrigger.sId, otherTrigger.sId, "unknown"],
    });

    expect(res.isOk()).toBe(true);
    const remaining = await TriggerResource.listByAgentConfigurationId(
      authenticator,
      agent.sId
    );
    expect(remaining.map((t) => t.sId)).toEqual([otherTrigger.sId]);
  });

  it("lets a workspace admin delete any trigger of the agent", async () => {
    const { workspace, authenticator } = await createResourceTest({
      role: "admin",
      plan: "creditPriced",
    });
    const otherAuth = await createMemberAuth(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(otherAuth);
    const otherTrigger = await TriggerFactory.schedule(otherAuth, {
      agentConfigurationId: agent.sId,
      configuration: CRON_CONFIGURATION,
    });

    const res = await deleteAgentTriggers(authenticator, {
      agentId: agent.sId,
      triggerIds: [otherTrigger.sId],
    });

    expect(res.isOk()).toBe(true);
    expect(
      await TriggerResource.listByAgentConfigurationId(authenticator, agent.sId)
    ).toEqual([]);
  });
});
