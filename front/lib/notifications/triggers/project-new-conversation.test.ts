import { filterMembersByNotifyCondition } from "@app/lib/notifications/triggers/project-new-conversation";
import type { UserResource } from "@app/lib/resources/user_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_CONDITION,
  type NotificationCondition,
} from "@app/types/notification_preferences";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, test } from "vitest";

describe("filterMembersByNotifyCondition", () => {
  let workspace: WorkspaceType;
  let user1: UserResource;
  let user2: UserResource;
  let user3: UserResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    user1 = await UserFactory.basic();
    user2 = await UserFactory.basic();
    user3 = await UserFactory.basic();

    await MembershipFactory.associate(workspace, user1, { role: "user" });
    await MembershipFactory.associate(workspace, user2, { role: "user" });
    await MembershipFactory.associate(workspace, user3, { role: "user" });
  });

  test("should include user with 'all_messages' preference", async () => {
    const preference: NotificationCondition = "all_messages";
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      preference
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(members);

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
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(0);
  });

  test("should exclude user with 'never' preference", async () => {
    const preference: NotificationCondition = "never";
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      preference
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(0);
  });

  test("should default to 'all_messages' when no preference stored", async () => {
    // No preference set for user1
    const members = [user1];
    const result = await filterMembersByNotifyCondition(members);

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
    const result = await filterMembersByNotifyCondition(members);

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
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(1);
    expect(result[0].sId).toBe(user1.sId);
  });

  test("should handle empty members array", async () => {
    const members: UserResource[] = [];
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(0);
  });

  test("should verify default condition is 'all_messages'", () => {
    expect(DEFAULT_NOTIFICATION_CONDITION).toBe("all_messages");
  });
});
