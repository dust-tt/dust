import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  ButlerEvaluator,
  EvaluatorContext,
  EvaluatorResult,
} from "@app/lib/butler/evaluators/types";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { z } from "zod";

const FUNCTION_NAME = "evaluate_frame";
const CONFIDENCE_THRESHOLD = 70;

const FrameResult = z.object({
  frame_confidence: z.number(),
  frame_prompt: z.string(),
});

export const createFrameEvaluator: ButlerEvaluator = {
  type: "create_frame",

  shouldRun(context: EvaluatorContext): boolean {
    // Skip if a frame already exists in this conversation.
    return !context.hasFrame;
  },

  getPromptAndSpec(_context: EvaluatorContext): {
    prompt: string;
    specification: AgentActionSpecification;
  } {
    let prompt =
      "You are a conversation analyst. Your job is to determine if creating a visual Frame would benefit the conversation.\n\n";

    prompt +=
      "Frame creation guidelines:\n" +
      "- Frames are interactive visual components (dashboards, charts, presentations, formatted documents).\n" +
      "- Set frame_confidence HIGH (>75) only when the conversation contains content that would clearly " +
      "benefit from visual presentation: data analysis results, document iterations, structured reports, " +
      "comparisons, or summaries that deserve a polished visual output.\n" +
      "- Set frame_confidence LOW (<30) when the conversation is purely Q&A, has no structured data " +
      "or document content, or the user hasn't reached a point where a visual output would add value.\n" +
      '- The frame_prompt should start with "Use the Create Frames skill to" followed by a description of the Frame to create ' +
      'based on the conversation content (e.g. "Use the Create Frames skill to build a dashboard summarizing the quarterly sales data", ' +
      '"Use the Create Frames skill to turn this report into an interactive presentation").\n' +
      "- Be conservative -- only suggest frames when there is clear value in a visual output.\n\n";

    prompt += "You MUST call the tool. Always call it.";

    const specification: AgentActionSpecification = {
      name: FUNCTION_NAME,
      description:
        "Evaluate whether creating a visual Frame would benefit the conversation.",
      inputSchema: {
        type: "object",
        properties: {
          frame_confidence: {
            type: "number",
            description:
              "Confidence from 0 to 100 that creating a visual Frame would benefit the conversation. " +
              "Use 0 if the conversation does not have content that would benefit from visual output.",
          },
          frame_prompt: {
            type: "string",
            description:
              "A prompt describing the Frame to create, or empty string if none.",
          },
        },
        required: ["frame_confidence", "frame_prompt"],
      },
    };

    return { prompt, specification };
  },

  parseResult(
    toolArguments: Record<string, unknown>,
    context: EvaluatorContext
  ): EvaluatorResult | null {
    const parsed = FrameResult.safeParse(toolArguments);
    if (!parsed.success) {
      return null;
    }

    const { frame_confidence, frame_prompt } = parsed.data;

    if (frame_confidence < CONFIDENCE_THRESHOLD || !frame_prompt) {
      return null;
    }

    // Find the @dust agent to use for frame creation.
    // We search all agents (not just availableAgents which filters out globals).
    // The dust agent sId is a well-known constant.
    return {
      suggestionType: "create_frame",
      metadata: {
        agentSId: GLOBAL_AGENTS_SID.DUST,
        agentName: "Dust",
        prompt: frame_prompt,
      },
    };
  },
};
