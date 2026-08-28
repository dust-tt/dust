import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WakeUpFactory } from "@app/tests/utils/WakeUpFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });

  const agentConfiguration =
    await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [new Date()],
  });

  return { agentConfiguration, auth, conversation, workspace };
}

function wakeUpsUrl(workspaceId: string, conversationId: string) {
  return `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}/wakeups`;
}

describe("GET /api/poke/workspaces/:wId/conversations/:cId/wakeups", () => {
  beforeEach(() => {
    vi.spyOn(
      wakeUpClient,
      "launchOrScheduleWakeUpTemporalWorkflow"
    ).mockResolvedValue(new Ok(undefined));
    vi.spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow").mockResolvedValue(
      new Ok(undefined)
    );
  });

  it("returns the conversation wake-ups", async () => {
    const { agentConfiguration, auth, conversation, workspace } = await setup();

    const wakeUp = await WakeUpFactory.cron(
      auth,
      conversation,
      agentConfiguration,
      { cronExpression: "0 7 * * *", reason: "daily digest" }
    );

    const response = await honoApp.request(
      wakeUpsUrl(workspace.sId, conversation.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.wakeUps).toHaveLength(1);
    expect(data.wakeUps[0]).toMatchObject({
      sId: wakeUp.sId,
      agentConfigurationId: agentConfiguration.sId,
      reason: "daily digest",
      status: "scheduled",
      scheduleConfig: {
        type: "cron",
        cron: "0 7 * * *",
        timezone: "Europe/Paris",
      },
    });
  });

  it("includes terminal wake-ups", async () => {
    const { agentConfiguration, auth, conversation, workspace } = await setup();

    const wakeUp = await WakeUpFactory.cron(
      auth,
      conversation,
      agentConfiguration
    );
    const cancelRes = await wakeUp.cancel(auth);
    expect(cancelRes.isOk()).toBe(true);

    const response = await honoApp.request(
      wakeUpsUrl(workspace.sId, conversation.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.wakeUps).toHaveLength(1);
    expect(data.wakeUps[0].status).toBe("cancelled");
  });

  it("returns an empty list when the conversation has no wake-up", async () => {
    const { conversation, workspace } = await setup();

    const response = await honoApp.request(
      wakeUpsUrl(workspace.sId, conversation.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.wakeUps).toEqual([]);
  });

  it("returns 404 for an unknown conversation", async () => {
    const { workspace } = await setup();

    const response = await honoApp.request(
      wakeUpsUrl(workspace.sId, "unknown-conversation")
    );

    expect(response.status).toBe(404);
  });
});
