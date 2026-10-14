import { Authenticator } from "@app/lib/auth";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import {
  buildDocumentCommentMentionCopy,
  getReadableMentions,
} from "@app/lib/notifications/workflows/document-comment-mention";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { podScopedPath } from "@app/types/file_system";
import { describe, expect, it } from "vitest";

const DETAILS = { authorName: "Ada Lovelace", fileName: "plan.md" };

describe("buildDocumentCommentMentionCopy", () => {
  it("renders the copy in English", async () => {
    const { subject, content } = buildDocumentCommentMentionCopy(
      await getNotificationI18n("en-US"),
      DETAILS
    );

    expect(subject).toBe('Ada Lovelace mentioned you in "plan.md"');
    expect(content).toBe(
      'Ada Lovelace mentioned you in a comment on "plan.md".'
    );
  });

  it("renders the copy in French", async () => {
    const { content } = buildDocumentCommentMentionCopy(
      await getNotificationI18n("fr-FR"),
      DETAILS
    );

    expect(content).toBe(
      "Ada Lovelace vous a mentionné dans un commentaire sur «\u00a0plan.md\u00a0»."
    );
  });
});

describe("getReadableMentions", () => {
  it("keeps only the mentions of documents the subscriber can still read", async () => {
    const {
      workspace,
      user: author,
      authenticator,
    } = await createResourceTest({ role: "user" });
    await FeatureFlagFactory.basic(authenticator, "co_edition");
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/markdown",
      size: "10",
    }));
    const member = await UserFactory.basic();
    const outsider = await UserFactory.basic();
    const stranger = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    await MembershipFactory.associate(workspace, outsider, { role: "user" });

    const pod = await SpaceFactory.project(workspace, author.id);
    const added = await pod.addMembers(
      await Authenticator.fromUserIdAndWorkspaceId(author.sId, workspace.sId),
      { userIds: [author.sId, member.sId] }
    );
    expect(added.isOk()).toBe(true);
    const payloads = ["plan.md", "notes/brief.md"].map((relPath) => ({
      workspaceId: workspace.sId,
      documentPath: podScopedPath(pod.sId, relPath),
      commentId: "c1",
      authorName: author.fullName(),
      fileName: relPath,
      route: `/route/${relPath}`,
    }));

    const readable = await getReadableMentions(
      member.sId,
      workspace.sId,
      payloads
    );
    expect(readable?.workspaceName).toBe(workspace.name);
    expect(readable?.mentions).toEqual([
      {
        authorName: author.fullName(),
        fileName: "plan.md",
        route: "/route/plan.md",
      },
      expect.objectContaining({ fileName: "notes/brief.md" }),
    ]);

    expect(
      (await getReadableMentions(outsider.sId, workspace.sId, payloads))
        ?.mentions
    ).toEqual([]);
    expect(
      await getReadableMentions(stranger.sId, workspace.sId, payloads)
    ).toBeNull();
  });
});
