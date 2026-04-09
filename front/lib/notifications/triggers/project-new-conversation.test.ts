import { Authenticator } from "@app/lib/auth";
import { filterMembersByNotifyCondition } from "@app/lib/notifications/triggers/project-new-conversation";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectNotificationPreferenceResource } from "@app/lib/resources/user_project_notification_preferences_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_CONDITION,
  type NotificationCondition,
} from "@app/types/notification_preferences";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, test } from "vitest";

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
      await UserProjectNotificationPreferenceResource.setPreference(userAuth, {
        spaceModelId: space.id,
        preference,
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
