import type { Authenticator } from "@app/lib/auth";
import { getTaskQueueForRun } from "@app/temporal/agent_loop/client";
import {
  BATCH_QUEUE_NAME,
  INTERACTIVE_QUEUE_NAME,
  PROGRAMMATIC_QUEUE_NAME,
  QUEUE_NAME,
  SCHEDULES_QUEUE_NAME,
} from "@app/temporal/agent_loop/config";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { faker } from "@faker-js/faker";
import { describe, expect, it } from "vitest";

async function setupAuth({
  withRoutingFlag,
}: {
  withRoutingFlag: boolean;
}): Promise<Authenticator> {
  const { authenticator } = await createResourceTest({ role: "admin" });
  if (withRoutingFlag) {
    await FeatureFlagFactory.basic(authenticator, "agent_loop_qos_routing");
  }
  return authenticator;
}

async function createTriggeredConversation(
  auth: Authenticator,
  triggerKind: "schedule" | "webhook" | null
): Promise<string> {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    name: faker.string.alphanumeric(12),
  });

  let triggerId: number | null = null;
  if (triggerKind === "schedule") {
    const trigger = await TriggerFactory.schedule(auth, {
      agentConfigurationId: agent.sId,
      configuration: { cron: "0 9 * * 1", timezone: "UTC" },
    });
    triggerId = trigger.id;
  } else if (triggerKind === "webhook") {
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      configuration: { includePayload: true },
    });
    triggerId = trigger.id;
  }

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
    triggerId,
  });

  return conversation.sId;
}

describe("getTaskQueueForRun", () => {
  it("routes everything to the default queue without the feature flag", async () => {
    const auth = await setupAuth({ withRoutingFlag: false });
    const conversationId = await createTriggeredConversation(auth, "webhook");

    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "web",
        conversationId,
      })
    ).toBe(QUEUE_NAME);
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "triggered",
        conversationId,
      })
    ).toBe(QUEUE_NAME);
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "api",
        conversationId,
      })
    ).toBe(QUEUE_NAME);
  });

  it("routes human surfaces when the feature flag is enabled", async () => {
    const auth = await setupAuth({ withRoutingFlag: true });
    const conversationId = await createTriggeredConversation(auth, null);

    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "web",
        conversationId,
      })
    ).toBe(INTERACTIVE_QUEUE_NAME);
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "slack",
        conversationId,
      })
    ).toBe(INTERACTIVE_QUEUE_NAME);
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "teams",
        conversationId,
      })
    ).toBe(INTERACTIVE_QUEUE_NAME);
  });

  it("routes machine surfaces when the feature flag is enabled", async () => {
    const auth = await setupAuth({ withRoutingFlag: true });
    const conversationId = await createTriggeredConversation(auth, null);

    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "wakeup",
        conversationId,
      })
    ).toBe(SCHEDULES_QUEUE_NAME);
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "triggered_programmatic",
        conversationId,
      })
    ).toBe(BATCH_QUEUE_NAME);
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "reinforcement",
        conversationId,
      })
    ).toBe(BATCH_QUEUE_NAME);
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "api",
        conversationId,
      })
    ).toBe(PROGRAMMATIC_QUEUE_NAME);
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "zapier",
        conversationId,
      })
    ).toBe(PROGRAMMATIC_QUEUE_NAME);
  });

  it("routes triggered runs by the conversation's trigger kind", async () => {
    const auth = await setupAuth({ withRoutingFlag: true });

    const scheduleConversationId = await createTriggeredConversation(
      auth,
      "schedule"
    );
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "triggered",
        conversationId: scheduleConversationId,
      })
    ).toBe(SCHEDULES_QUEUE_NAME);

    const webhookConversationId = await createTriggeredConversation(
      auth,
      "webhook"
    );
    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "triggered",
        conversationId: webhookConversationId,
      })
    ).toBe(BATCH_QUEUE_NAME);
  });

  it("routes triggered runs without a resolvable trigger to schedules", async () => {
    const auth = await setupAuth({ withRoutingFlag: true });
    const conversationId = await createTriggeredConversation(auth, null);

    expect(
      await getTaskQueueForRun(auth, {
        userMessageOrigin: "triggered",
        conversationId,
      })
    ).toBe(SCHEDULES_QUEUE_NAME);
  });
});
