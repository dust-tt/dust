import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("WakeUpResource", () => {
  let auth: Authenticator;
  let secondWorkspaceAuth: Authenticator;
  let conversationId: number;
  let conversationResource: ConversationResource;
  let agentConfiguration: Awaited<
    ReturnType<typeof AgentConfigurationFactory.createTestAgent>
  >;

  beforeEach(async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    agentConfiguration = await AgentConfigurationFactory.createTestAgent(auth);

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    conversationId = conversation.id;

    const fetchedConversation = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (!fetchedConversation) {
      throw new Error("Conversation should exist");
    }
    conversationResource = fetchedConversation;

    const secondWorkspace = await WorkspaceFactory.basic();
    const secondUser = await UserFactory.basic();
    await MembershipFactory.associate(secondWorkspace, secondUser, {
      role: "admin",
    });
    secondWorkspaceAuth = await Authenticator.fromUserIdAndWorkspaceId(
      secondUser.sId,
      secondWorkspace.sId
    );
  });

  it("creates and lists wake-ups for a conversation", async () => {
    const result = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "one_shot",
        fireAt: new Date("2026-04-20T10:00:00.000Z"),
        cronExpression: null,
        cronTimezone: null,
        reason: "Follow up later",
      },
      conversationResource,
      agentConfiguration
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.status).toBe("scheduled");
    expect(result.value.fireCount).toBe(0);

    const wakeUps = await WakeUpResource.listByConversation(
      auth,
      conversationResource.toJSON()
    );
    expect(wakeUps).toHaveLength(1);
    expect(wakeUps[0].conversationId).toBe(conversationId);
    expect(wakeUps[0].reason).toBe("Follow up later");
  });

  it("lists only active wake-ups in the authenticated workspace", async () => {
    const first = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "one_shot",
        fireAt: new Date("2026-04-20T10:00:00.000Z"),
        cronExpression: null,
        cronTimezone: null,
        reason: "Active wake-up",
      },
      conversationResource,
      agentConfiguration
    );
    if (first.isErr()) {
      throw first.error;
    }

    const second = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "one_shot",
        fireAt: new Date("2026-04-20T11:00:00.000Z"),
        cronExpression: null,
        cronTimezone: null,
        reason: "Cancelled wake-up",
      },
      conversationResource,
      agentConfiguration
    );
    if (second.isErr()) {
      throw second.error;
    }

    const cancelResult = await second.value.cancel(auth);
    expect(cancelResult.isOk()).toBe(true);

    const otherAgent =
      await AgentConfigurationFactory.createTestAgent(secondWorkspaceAuth);
    const otherConversation = await ConversationFactory.create(
      secondWorkspaceAuth,
      {
        agentConfigurationId: otherAgent.sId,
        messagesCreatedAt: [],
      }
    );
    const otherConversationResource = await ConversationResource.fetchById(
      secondWorkspaceAuth,
      otherConversation.sId
    );
    if (!otherConversationResource) {
      throw new Error("Conversation should exist");
    }

    const third = await WakeUpResource.makeNew(
      secondWorkspaceAuth,
      {
        scheduleType: "one_shot",
        fireAt: new Date("2026-04-20T12:00:00.000Z"),
        cronExpression: null,
        cronTimezone: null,
        reason: "Other workspace wake-up",
      },
      otherConversationResource,
      otherAgent
    );
    if (third.isErr()) {
      throw third.error;
    }

    const activeWakeUps = await WakeUpResource.listActiveByWorkspace(auth);
    expect(activeWakeUps).toHaveLength(1);
    expect(activeWakeUps[0].reason).toBe("Active wake-up");
  });

  it("cancels scheduled wake-ups", async () => {
    const result = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "one_shot",
        fireAt: new Date("2026-04-20T10:00:00.000Z"),
        cronExpression: null,
        cronTimezone: null,
        reason: "Cancel me",
      },
      conversationResource,
      agentConfiguration
    );
    if (result.isErr()) {
      throw result.error;
    }

    const cancelResult = await result.value.cancel(auth);
    expect(cancelResult.isOk()).toBe(true);
    expect(result.value.status).toBe("cancelled");
  });

  it("marks one-shot wake-ups as fired", async () => {
    const result = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "one_shot",
        fireAt: new Date("2026-04-20T10:00:00.000Z"),
        cronExpression: null,
        cronTimezone: null,
        reason: "Fire once",
      },
      conversationResource,
      agentConfiguration
    );
    if (result.isErr()) {
      throw result.error;
    }

    const markFiredResult = await result.value.markFired(auth);
    expect(markFiredResult.isOk()).toBe(true);
    expect(result.value.status).toBe("fired");
    expect(result.value.fireCount).toBe(1);
  });

  it("keeps cron wake-ups scheduled when marked as fired", async () => {
    const result = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "cron",
        fireAt: null,
        cronExpression: "0 9 * * MON-FRI",
        cronTimezone: "UTC",
        reason: "Recurring wake-up",
      },
      conversationResource,
      agentConfiguration
    );
    if (result.isErr()) {
      throw result.error;
    }

    const markFiredResult = await result.value.markFired(auth);
    expect(markFiredResult.isOk()).toBe(true);
    expect(result.value.status).toBe("scheduled");
    expect(result.value.fireCount).toBe(1);
  });

  it("cleans up wake-ups by conversation", async () => {
    const first = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "one_shot",
        fireAt: new Date("2026-04-20T10:00:00.000Z"),
        cronExpression: null,
        cronTimezone: null,
        reason: "First wake-up",
      },
      conversationResource,
      agentConfiguration
    );
    if (first.isErr()) {
      throw first.error;
    }

    const second = await WakeUpResource.makeNew(
      auth,
      {
        scheduleType: "cron",
        fireAt: null,
        cronExpression: "0 9 * * MON-FRI",
        cronTimezone: "UTC",
        reason: "Second wake-up",
      },
      conversationResource,
      agentConfiguration
    );
    if (second.isErr()) {
      throw second.error;
    }

    const cleanupResult = await WakeUpResource.cleanupByConversation(
      auth,
      conversationResource.toJSON()
    );
    expect(cleanupResult.isOk()).toBe(true);

    const wakeUps = await WakeUpResource.listByConversation(
      auth,
      conversationResource.toJSON()
    );
    expect(wakeUps).toHaveLength(0);
  });
});
