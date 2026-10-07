import {
  documentCommentMessageHeading,
  documentCommentsSkill,
  isDocumentCommentMessage,
} from "@app/lib/resources/skill/code_defined/system/document_comments";
import { describe, expect, it } from "vitest";

describe("documentCommentsSkill", () => {
  it("is auto-enabled, so it is in the system prompt when not disabled", () => {
    expect(documentCommentsSkill.getAutoEnabledOrEquippedForAgentLoop()).toBe(
      "enabled"
    );
  });

  it("recognizes a message opening with the comment heading", () => {
    const heading = documentCommentMessageHeading({
      commentId: "c1",
      documentPath: "pod-abc/plan.md",
      location: 'the pod "Launch"',
    });

    expect(isDocumentCommentMessage(`${heading}\n\nThoughts @dust?`)).toBe(
      true
    );
  });

  it.each([
    "Summarize plan.md, please.",
    "Comment in thread `c1` disappeared; help me debug it",
    "Comment in thread `c1` of the document `a.md`, in a pod: and more",
  ])("does not recognize %j", (content) => {
    expect(isDocumentCommentMessage(content)).toBe(false);
  });
});
