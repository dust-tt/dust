import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/triggers/wakeup_client", () => ({
  cancelWakeUpTemporalWorkflow: vi
    .fn()
    .mockResolvedValue({ isErr: () => false }),
  launchOrScheduleWakeUpTemporalWorkflow: vi.fn(),
  makeWakeUpScheduleId: vi.fn(() => "schedule-id"),
  makeWakeUpWorkflowId: vi.fn(() => "workflow-id"),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
  publishConversationEvent: vi.fn(),
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
}));

import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { launchOrScheduleWakeUpTemporalWorkflow } from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentConfigurationWithoutModelType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ConversationContextMode } from "@app/types/assistant/conversation_context_mode";
import { Ok } from "@app/types/shared/result";

describe("WakeUpResource conversation context mode", () => {
  let auth: Authenticator;
  let conversation: ConversationWithoutContentType;
  let agentConfiguration: AgentConfigurationWithoutModelType;

  async function createWakeUp({
    conversationContextMode,
    schedule = "one_shot",
  }: {
    conversationContextMode: ConversationContextMode;
    schedule?: "one_shot" | "cron";
  }) {
    const blob =
      schedule === "one_shot"
        ? {
            scheduleType: "one_shot" as const,
            fireAt: new Date(Date.now() + 60 * 60 * 1000),
            cronExpression: null,
            cronTimezone: null,
            reason: "Check back later",
            conversationContextMode,
          }
        : {
            scheduleType: "cron" as const,
            fireAt: null,
            cronExpression: "0 9 * * 1",
            cronTimezone: "Europe/Paris",
            reason: "Weekly check",
            conversationContextMode,
          };

    const res = await WakeUpResource.makeNew(
      auth,
      blob,
      conversation,
      agentConfiguration
    );
    if (res.isErr()) {
      throw res.error;
    }
    return res.value;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(launchOrScheduleWakeUpTemporalWorkflow).mockResolvedValue(
      new Ok(undefined)
    );

    const setup = await createResourceTest({});
    auth = setup.authenticator;

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Wake-up Test Agent",
      description: "Agent used by the wake-up context isolation tests",
    });
    agentConfiguration = agent as unknown as AgentConfigurationWithoutModelType;

    const created = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    const resource = await ConversationResource.fetchById(auth, created.sId);
    if (!resource) {
      throw new Error("Failed to fetch conversation resource");
    }
    conversation = resource.toJSON();
  });

  it("persists full mode and exposes it on the serialized wake-up", async () => {
    const wakeUp = await createWakeUp({ conversationContextMode: "full" });

    expect(wakeUp.conversationContextMode).toEqual("full");
    expect(wakeUp.toJSON().conversationContextMode).toEqual("full");
  });

  it("persists isolated mode on a one-shot wake-up", async () => {
    const wakeUp = await createWakeUp({ conversationContextMode: "isolated" });

    expect(wakeUp.toJSON().conversationContextMode).toEqual("isolated");

    // Re-read from the database: the mode the firing workflow will use comes from the row, not
    // from the in-memory resource it was created from.
    const reloaded = await WakeUpResource.fetchById(auth, wakeUp.sId);
    expect(reloaded?.conversationContextMode).toEqual("isolated");
  });

  it("persists isolated mode on a cron wake-up so every firing is isolated", async () => {
    const wakeUp = await createWakeUp({
      conversationContextMode: "isolated",
      schedule: "cron",
    });

    const reloaded = await WakeUpResource.fetchById(auth, wakeUp.sId);
    expect(reloaded?.toJSON().scheduleConfig.type).toEqual("cron");
    // A single persisted value drives every firing; each firing posts its own user message into
    // the same conversation and therefore gets its own isolation root.
    expect(reloaded?.conversationContextMode).toEqual("isolated");
  });

  it("keeps the wake-up in its own conversation", async () => {
    const wakeUp = await createWakeUp({ conversationContextMode: "isolated" });

    expect(wakeUp.conversationId).toEqual(conversation.id);

    const byConversation = await WakeUpResource.listByConversation(
      auth,
      conversation
    );
    expect(byConversation.map((w) => w.sId)).toContain(wakeUp.sId);
  });
});
