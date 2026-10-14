import type { NewCommentMessage } from "@app/lib/api/documents/comment_signatures";
import { Authenticator } from "@app/lib/auth";
import {
  getDocumentRouteAndSpace,
  triggerDocumentCommentMentionNotifications,
} from "@app/lib/notifications/triggers/document-comment-mention";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { podScopedPath } from "@app/types/file_system";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DOCUMENT_COMMENT_MENTION_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { triggerBulk } = vi.hoisted(() => ({ triggerBulk: vi.fn() }));

vi.mock("@app/lib/notifications/novu-client", () => ({
  getNovuClient: async () => ({ triggerBulk }),
}));

const mention = (user: UserResource) =>
  `:mention_user[${user.fullName()}]{sId=${user.sId}}`;

function newMessage(body: string): NewCommentMessage {
  return {
    commentId: "c1",
    quote: null,
    message: {
      author: { kind: "user", id: "author", name: "Author" },
      createdAt: new Date().toISOString(),
      body,
    },
  };
}

describe("document comment mention notifications", () => {
  let workspace: LightWorkspaceType;
  let authorAuth: Authenticator;
  let pod: SpaceResource;
  let member: UserResource;
  let outsider: UserResource;
  let documentPath: string;

  beforeEach(async () => {
    const result = await createResourceTest({ role: "user" });
    workspace = result.workspace;
    const author = result.user;

    member = await UserFactory.basic();
    outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    await MembershipFactory.associate(workspace, outsider, { role: "user" });

    pod = await SpaceFactory.project(workspace, author.id);
    authorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      author.sId,
      workspace.sId
    );
    const added = await pod.addMembers(authorAuth, {
      userIds: [author.sId, member.sId],
    });
    expect(added.isOk()).toBe(true);
    documentPath = podScopedPath(pod.sId, "notes/plan.md");
    await FeatureFlagFactory.basic(authorAuth, "co_edition");
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/markdown",
      size: "10",
    }));

    triggerBulk.mockReset().mockResolvedValue({ result: [] });
  });

  it("links to the document's folder in its pod", async () => {
    const document = await getDocumentRouteAndSpace(authorAuth, documentPath);

    expect(document).toEqual({
      route: `/w/${workspace.sId}/pods/${pod.sId}?path=notes#files`,
      spaceModelId: pod.id,
    });
  });

  it("notifies mentioned readers only, once each", async () => {
    const author = authorAuth.getNonNullableUser();
    const result = await triggerDocumentCommentMentionNotifications(
      authorAuth,
      {
        documentPath,
        newMessage: newMessage(
          `${mention(member)} ${mention(member)} ${mention(outsider)} :mention_user[Me]{sId=${author.sId}}`
        ),
      }
    );

    expect(result.isOk()).toBe(true);
    expect(triggerBulk).toHaveBeenCalledOnce();
    const { events } = triggerBulk.mock.calls[0][0];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      workflowId: DOCUMENT_COMMENT_MENTION_TRIGGER_ID,
      to: { subscriberId: member.sId },
      payload: {
        documentPath,
        commentId: "c1",
        authorName: author.fullName(),
        fileName: "plan.md",
        route: expect.stringContaining(pod.sId),
      },
    });
  });

  it("keys each recipient's notification to the comment message", async () => {
    const message = newMessage(mention(member));

    await triggerDocumentCommentMentionNotifications(authorAuth, {
      documentPath,
      newMessage: message,
    });
    await triggerDocumentCommentMentionNotifications(authorAuth, {
      documentPath,
      newMessage: message,
    });

    const [first, second] = triggerBulk.mock.calls.map(
      ([{ events }]) => events[0].transactionId
    );
    expect(first).toContain(member.sId);
    expect(second).toBe(first);
  });

  it("notifies no one about a document that no longer exists", async () => {
    fileStorageMock.setFileExists(() => false);
    fileStorageMock.setFileMetadata(() => null);

    await triggerDocumentCommentMentionNotifications(authorAuth, {
      documentPath,
      newMessage: newMessage(mention(member)),
    });

    expect(triggerBulk).not.toHaveBeenCalled();
  });

  it("skips users who never want conversation notifications", async () => {
    await member.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      "never"
    );

    await triggerDocumentCommentMentionNotifications(authorAuth, {
      documentPath,
      newMessage: newMessage(mention(member)),
    });

    expect(triggerBulk).not.toHaveBeenCalled();
  });
});
