import {
  documentCommentMessageHeading,
  documentCommentsSkill,
} from "@app/lib/resources/skill/code_defined/system/document_comments";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { describe, expect, it } from "vitest";

function agentLoopDataWithContent(content: string): AgentLoopExecutionData {
  return {
    userMessage: { content },
  } as unknown as AgentLoopExecutionData;
}

describe("documentCommentsSkill", () => {
  it("is always active for a run answering a document comment", () => {
    const content = `${documentCommentMessageHeading({
      commentId: "c1",
      documentPath: "pod-abc/plan.md",
      location: 'the pod "Launch"',
    })}\n\nThoughts @dust?`;

    expect(documentCommentsSkill.getAutoEnabledOrEquippedForAgentLoop()).toBe(
      "enabled"
    );
    expect(
      documentCommentsSkill.isDisabledForAgentLoop(
        agentLoopDataWithContent(content)
      )
    ).toBe(false);
  });

  it("is unavailable for any other run", () => {
    expect(
      documentCommentsSkill.isDisabledForAgentLoop(
        agentLoopDataWithContent("Summarize plan.md, please.")
      )
    ).toBe(true);
  });
});
