import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import {
  documentCommentOf,
  parseDocumentCommentMessage,
  serializeDocumentCommentDirective,
} from "@app/types/assistant/document_comment";
import { describe, expect, it } from "vitest";

describe("document comment directive", () => {
  it.each([
    { commentId: "c1", documentPath: "pod-abc/plan.md", quote: null },
    {
      commentId: "c1",
      documentPath: 'pod-abc/a "b" & c.md',
      quote: "a [link](x) \\ and :mention_user[Yuka]{sId=usr_yuka}",
    },
  ])("gives back what it serialized for %j", (comment) => {
    const content = `${serializeDocumentCommentDirective(comment)}\n\nThoughts?`;

    expect(parseDocumentCommentMessage(content)).toEqual({
      comment,
      body: "Thoughts?",
    });
  });

  it("flattens and caps the quoted passage", () => {
    const parsed = parseDocumentCommentMessage(
      serializeDocumentCommentDirective({
        commentId: "c1",
        documentPath: "pod-abc/plan.md",
        quote: `Ship  on\nThursday. ${"x".repeat(600)}`,
      })
    );

    expect(parsed?.comment.quote).toMatch(/^Ship on Thursday\. x+…$/);
    expect(parsed?.comment.quote).toHaveLength(500);
  });

  it("parses only a message that opens with the directive", () => {
    expect(
      parseDocumentCommentMessage(
        'See :document_comment[x]{id="c1" path="pod-abc/plan.md"}'
      )
    ).toBeNull();
  });

  it.each<[UserMessageOrigin, boolean]>([
    ["document_comment", true],
    ["web", false],
  ])("finds the comment of a %s message: %s", (origin, found) => {
    const comment = {
      commentId: "c1",
      documentPath: "pod-abc/plan.md",
      quote: "Ship on Thursday.",
    };
    const message = {
      content: `${serializeDocumentCommentDirective(comment)}\n\nThoughts?`,
      context: {
        username: "yuka",
        fullName: "Yuka",
        email: null,
        profilePictureUrl: null,
        timezone: "UTC",
        origin,
      },
    };

    expect(documentCommentOf(message)).toEqual(found ? comment : null);
  });
});
