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

  it.each([
    ["pod-abc/plan.md", 'the pod "Launch"'],
    ["pod-abc/use`code`.md", 'the pod "Launch"'],
    ["pod-abc/plan.md", 'the pod "Launch\nQ4"'],
  ])(
    "recognizes a message opening with the comment heading for %j",
    (documentPath, location) => {
      const heading = documentCommentMessageHeading({
        commentId: "c1",
        documentPath,
        location,
      });

      expect(isDocumentCommentMessage(`${heading}\n\nThoughts @dust?`)).toBe(
        true
      );
    }
  );

  it.each([
    "Summarize plan.md, please.",
    "Comment in thread `c1` disappeared; help me debug it",
  ])("does not recognize %j", (content) => {
    expect(isDocumentCommentMessage(content)).toBe(false);
  });
});
