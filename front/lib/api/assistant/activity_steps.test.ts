import { renderAgentMessageContentView } from "@app/lib/api/assistant/activity_steps";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import { describe, expect, it } from "vitest";

// Minimal, real (non-DeepSeek) agent configuration so the parser resolves the
// standard <thinking>/<response> chain-of-thought delimiters. No DB needed:
// `renderAgentMessageContentView` is pure.
const agentConfiguration: LightAgentConfigurationType = {
  id: 1,
  versionCreatedAt: null,
  sId: "agent_test",
  version: 0,
  versionAuthorId: null,
  instructions: null,
  model: {
    providerId: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    temperature: 0,
  },
  status: "active",
  scope: "visible",
  userFavorite: false,
  name: "Test Agent",
  description: "Test Agent",
  pictureUrl: "",
  maxStepsPerRun: 8,
  tags: [],
  templateId: null,
  requestedGroupIds: [],
  requestedSpaceIds: [],
  canRead: true,
  canEdit: false,
};

function render(
  contents: Array<{ step: number; content: AgentContentItemType }>
) {
  return renderAgentMessageContentView(
    contents,
    [],
    agentConfiguration,
    "msg_test"
  );
}

describe("renderAgentMessageContentView", () => {
  it("treats a single plain text content as the body, with no steps", async () => {
    expect(
      await render([
        { step: 0, content: { type: "text_content", value: "Hello" } },
      ])
    ).toEqual({
      content: "Hello",
      chainOfThought: null,
      activitySteps: [],
    });
  });

  it("selects native reasoning as CoT and the last text as the body", async () => {
    expect(
      await render([
        {
          step: 0,
          content: {
            type: "reasoning",
            value: {
              reasoning: "Let me think",
              metadata: "",
              tokens: 0,
              provider: "anthropic",
            },
          },
        },
        { step: 0, content: { type: "text_content", value: "The answer" } },
      ])
    ).toEqual({
      content: "The answer",
      chainOfThought: "Let me think",
      activitySteps: [
        { type: "thinking", content: "Let me think", id: "reasoning-0-0" },
      ],
    });
  });

  it("extracts CoT from <thinking> delimiters when there is no native reasoning", async () => {
    expect(
      await render([
        {
          step: 0,
          content: {
            type: "text_content",
            value: "<thinking>pondering</thinking><response>Answer</response>",
          },
        },
      ])
    ).toEqual({
      content: "Answer",
      chainOfThought: "pondering\n",
      activitySteps: [
        { type: "thinking", content: "pondering\n", id: "cot-0-0" },
      ],
    });
  });

  it("turns an intermediate text into a content step and joins the body", async () => {
    expect(
      await render([
        { step: 0, content: { type: "text_content", value: "first" } },
        { step: 1, content: { type: "text_content", value: "second" } },
      ])
    ).toEqual({
      content: "first\nsecond",
      chainOfThought: null,
      activitySteps: [{ type: "content", content: "first", id: "content-0-0" }],
    });
  });
});
