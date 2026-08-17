import { Authenticator } from "@app/lib/auth";
import { getNovuClient } from "@app/lib/notifications";
import {
  areForYouNotificationsEnabled,
  filterMembersByNotifyCondition,
  notifyActivationConversationAgentReplied,
} from "@app/lib/notifications/triggers/project-new-conversation";
import { getActivationNewConversationEmailSubject } from "@app/lib/notifications/workflows/activation-new-conversation";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { NotificationCondition } from "@app/types/notification_preferences";
import {
  ACTIVATION_NEW_CONVERSATION_TRIGGER_ID,
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_CONDITION,
  FOR_YOU_NOTIFICATION_METADATA_KEY,
} from "@app/types/notification_preferences";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { mockTriggerBulk } = vi.hoisted(() => ({
  mockTriggerBulk: vi.fn().mockResolvedValue({ result: [] }),
}));

// Mock Novu client so tests can assert whether the activation email was triggered.
vi.mock(import("@app/lib/notifications"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getNovuClient: vi.fn().mockResolvedValue({
      triggerBulk: mockTriggerBulk,
    }),
  };
});

describe("getActivationNewConversationEmailSubject", () => {
  test("uses the recommendation name", () => {
    expect(
      getActivationNewConversationEmailSubject(
        "  Prepare the weekly\ncustomer review  "
      )
    ).toBe("[Dust] Recommendation For You: Prepare the weekly customer review");
  });

  test("falls back when no recommendation name is available", () => {
    expect(getActivationNewConversationEmailSubject(null)).toBe(
      "[Dust] Recommendation For You: A recommendation for you"
    );
  });
});

describe("filterMembersByNotifyCondition", () => {
  let workspace: LightWorkspaceType;
  let auth: Authenticator;
  let space: SpaceResource;
  let user1: UserResource;
  let user2: UserResource;
  let user3: UserResource;

  beforeEach(async () => {
    const result = await createResourceTest({ role: "admin" });
    workspace = result.workspace;
    user1 = result.user;
    auth = result.authenticator;

    user2 = await UserFactory.basic();
    user3 = await UserFactory.basic();

    await MembershipFactory.associate(workspace, user2, { role: "user" });
    await MembershipFactory.associate(workspace, user3, { role: "user" });

    space = await SpaceFactory.project(workspace);
  });

  test("should include user with 'all_messages' preference", async () => {
    const preference: NotificationCondition = "all_messages";
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      preference
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(
      auth,
      members,
      space.id
    );

    expect(result).toHaveLength(1);
    expect(result[0].sId).toBe(user1.sId);
  });

  test("should exclude user with 'only_mentions' preference", async () => {
    const preference: NotificationCondition = "only_mentions";
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      preference
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(
      auth,
      members,
      space.id
    );

    expect(result).toHaveLength(0);
  });

  test("should exclude user with 'never' preference", async () => {
    const preference: NotificationCondition = "never";
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      preference
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(
      auth,
      members,
      space.id
    );

    expect(result).toHaveLength(0);
  });

  test("should default to 'all_messages' when no preference stored", async () => {
    // No preference set for user1
    const members = [user1];
    const result = await filterMembersByNotifyCondition(
      auth,
      members,
      space.id
    );

    expect(result).toHaveLength(1);
    expect(result[0].sId).toBe(user1.sId);
  });

  test("should handle mixed preferences across multiple users", async () => {
    const firstPreference: NotificationCondition = "all_messages";
    const secondPreference: NotificationCondition = "never";
    // Set different preferences
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      firstPreference
    );
    await user2.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      secondPreference
    );
    // user3 has no preference (should default to "all_messages")

    const members = [user1, user2, user3];
    const result = await filterMembersByNotifyCondition(
      auth,
      members,
      space.id
    );

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.sId).sort()).toEqual(
      [user1.sId, user3.sId].sort()
    );
  });

  test("should handle invalid preference values by defaulting to 'all_messages'", async () => {
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      "invalid_preference" // Invalid value
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(
      auth,
      members,
      space.id
    );

    expect(result).toHaveLength(1);
    expect(result[0].sId).toBe(user1.sId);
  });

  test("should handle empty members array", async () => {
    const members: UserResource[] = [];
    const result = await filterMembersByNotifyCondition(
      auth,
      members,
      space.id
    );

    expect(result).toHaveLength(0);
  });

  test("should verify default condition is 'all_messages'", () => {
    expect(DEFAULT_NOTIFICATION_CONDITION).toBe("all_messages");
  });

  describe("project-level preference overrides", () => {
    async function setProjectPreference(
      user: UserResource,
      preference: NotificationCondition
    ) {
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      await UserProjectPreferencesResource.setNotificationPreference(userAuth, {
        spaceModelId: space.id,
        notificationPreference: preference,
      });
    }

    test("should override general 'all_messages' with project 'never'", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "all_messages"
      );
      await setProjectPreference(user1, "never");

      const members = [user1];
      const result = await filterMembersByNotifyCondition(
        auth,
        members,
        space.id
      );

      expect(result).toHaveLength(0);
    });

    test("should override general 'never' with project 'all_messages'", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "never"
      );
      await setProjectPreference(user1, "all_messages");

      const members = [user1];
      const result = await filterMembersByNotifyCondition(
        auth,
        members,
        space.id
      );

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    test("should fall back to general preference when no project preference exists", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "never"
      );
      // No project-level preference set

      const members = [user1];
      const result = await filterMembersByNotifyCondition(
        auth,
        members,
        space.id
      );

      expect(result).toHaveLength(0);
    });

    test("should handle mixed general and project preferences across users", async () => {
      // user1: general=never, project=all_messages -> should be included
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "never"
      );
      await setProjectPreference(user1, "all_messages");

      // user2: general=all_messages, no project pref -> should be included
      await user2.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "all_messages"
      );

      // user3: general=all_messages, project=only_mentions -> should be excluded
      await user3.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "all_messages"
      );
      await setProjectPreference(user3, "only_mentions");

      const members = [user1, user2, user3];
      const result = await filterMembersByNotifyCondition(
        auth,
        members,
        space.id
      );

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.sId).sort()).toEqual(
        [user1.sId, user2.sId].sort()
      );
    });
  });
});

describe("notifyActivationConversationAgentReplied", () => {
  let auth: Authenticator;
  let user: UserResource;
  let pod: SpaceResource;
  let agent: LightAgentConfigurationType;
  let workspace: LightWorkspaceType;

  beforeEach(async () => {
    const result = await createResourceTest({ role: "user" });
    user = result.user;
    auth = result.authenticator;
    workspace = result.workspace;

    pod = await SpaceFactory.project(result.workspace, user.id);

    agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "ActivationAgent",
      description: "Test",
    });

    await ProjectMetadataResource.makeNew(auth, pod, {
      description: null,
    });
    await ActivationPodResource.makeNew(auth, { pod, user });

    vi.mocked(getNovuClient).mockClear();
    mockTriggerBulk.mockClear();
  });

  // A conversation Dust opened with a nudge: its opening message carries the
  // nudge origin and has no author.
  async function createNudgeConversation() {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      spaceId: pod.id,
    });
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Run the Dust Learning workflow.",
      origin: "system_activation",
      authorless: true,
    });

    return conversation;
  }

  test("triggers the activation email for the pod's nudge-created conversation", async () => {
    const conversation = await createNudgeConversation();

    await notifyActivationConversationAgentReplied(auth, {
      conversationId: conversation.sId,
    });

    expect(vi.mocked(getNovuClient)).toHaveBeenCalled();
  });

  test("uses a stable Novu transaction for repeated completions of the same nudge conversation", async () => {
    const conversation = await createNudgeConversation();

    await notifyActivationConversationAgentReplied(auth, {
      conversationId: conversation.sId,
    });
    await notifyActivationConversationAgentReplied(auth, {
      conversationId: conversation.sId,
    });

    expect(mockTriggerBulk).toHaveBeenCalledTimes(2);
    const firstEvent = mockTriggerBulk.mock.calls[0][0].events[0];
    const secondEvent = mockTriggerBulk.mock.calls[1][0].events[0];
    expect(firstEvent.transactionId).toBe(
      `${ACTIVATION_NEW_CONVERSATION_TRIGGER_ID}-${workspace.sId}-${conversation.sId}-${user.sId}`
    );
    expect(secondEvent.transactionId).toBe(firstEvent.transactionId);
  });

  test("does not trigger the activation email for a conversation the user starts", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      spaceId: pod.id,
    });

    await notifyActivationConversationAgentReplied(auth, {
      conversationId: conversation.sId,
    });

    expect(vi.mocked(getNovuClient)).not.toHaveBeenCalled();
  });

  test("triggers the activation email when For You notifications are explicitly enabled", async () => {
    await user.setMetadata(FOR_YOU_NOTIFICATION_METADATA_KEY, "true");
    const conversation = await createNudgeConversation();

    await notifyActivationConversationAgentReplied(auth, {
      conversationId: conversation.sId,
    });

    expect(vi.mocked(getNovuClient)).toHaveBeenCalled();
  });

  test("does not trigger the activation email when For You notifications are disabled", async () => {
    await user.setMetadata(FOR_YOU_NOTIFICATION_METADATA_KEY, "false");
    const conversation = await createNudgeConversation();

    await notifyActivationConversationAgentReplied(auth, {
      conversationId: conversation.sId,
    });

    expect(vi.mocked(getNovuClient)).not.toHaveBeenCalled();
  });
});

describe("areForYouNotificationsEnabled", () => {
  test("allows sending when metadata is missing", async () => {
    const { user } = await createResourceTest({ role: "user" });

    expect(await areForYouNotificationsEnabled(user)).toBe(true);
  });

  test("allows sending when metadata is true", async () => {
    const { user } = await createResourceTest({ role: "user" });
    await user.setMetadata(FOR_YOU_NOTIFICATION_METADATA_KEY, "true");

    expect(await areForYouNotificationsEnabled(user)).toBe(true);
  });

  test("skips sending when metadata is false", async () => {
    const { user } = await createResourceTest({ role: "user" });
    await user.setMetadata(FOR_YOU_NOTIFICATION_METADATA_KEY, "false");

    expect(await areForYouNotificationsEnabled(user)).toBe(false);
  });
});
