import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { buildDocumentCommentMentionCopy } from "@app/lib/notifications/workflows/document-comment-mention";
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
      "Ada Lovelace vous a mentionné dans un commentaire sur « plan.md »."
    );
  });
});
