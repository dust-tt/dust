import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  ButlerEvaluator,
  EvaluatorContext,
  EvaluatorResult,
} from "@app/lib/butler/evaluators/types";
import { z } from "zod";

const FUNCTION_NAME = "evaluate_rename";
const CONFIDENCE_THRESHOLD = 70;

const RenameResult = z.object({
  rename_confidence: z.number(),
  new_title: z.string(),
});

export const renameTitleEvaluator: ButlerEvaluator = {
  type: "rename_title",

  shouldRun(): boolean {
    // Title rename is always worth evaluating.
    return true;
  },

  getPromptAndSpec(context: EvaluatorContext): {
    prompt: string;
    specification: AgentActionSpecification;
  } {
    let prompt =
      "You are a conversation analyst. Your job is to score how much the conversation title would benefit from being updated.\n\n";

    prompt +=
      "Title evaluation guidelines:\n" +
      "- The current title was auto-generated early in the conversation and may no longer reflect the main topic.\n" +
      "- A good title is 3-8 words, specific, and captures the main intent.\n" +
      "- Set rename_confidence HIGH (>75) only when the current title is clearly wrong, misleading, " +
      "or the conversation has shifted to a completely different topic.\n" +
      "- Set rename_confidence LOW (<30) when the current title is already a reasonable summary, " +
      "or the difference is just stylistic.\n" +
      "- Be conservative -- most auto-generated titles are adequate.\n\n";

    const renameHistory = context.suggestionHistory.filter(
      (s) => s.suggestionType === "rename_title"
    );
    if (renameHistory.length > 0) {
      prompt += "Previous rename suggestion history (most recent first):\n";
      for (const suggestion of renameHistory) {
        const outcome =
          suggestion.status === "accepted" ? "ACCEPTED" : "DISMISSED";
        const { suggestedTitle } = suggestion.metadata;
        prompt += `- [${outcome}] Title rename: "${suggestedTitle}"\n`;
      }
      prompt +=
        "\nDo NOT re-suggest titles that were DISMISSED. " +
        "Learn from accepted suggestions to understand user preferences.\n\n";
    }

    prompt +=
      "You MUST call the tool. Always call it.\n\n" +
      `The current conversation title is: "${context.currentTitle}"`;

    const specification: AgentActionSpecification = {
      name: FUNCTION_NAME,
      description: "Evaluate whether the conversation title should be updated.",
      inputSchema: {
        type: "object",
        properties: {
          rename_confidence: {
            type: "number",
            description:
              "Confidence from 0 to 100 that renaming the conversation title would improve it. " +
              "Use 0 if the current title is already adequate.",
          },
          new_title: {
            type: "string",
            description: "The proposed new title (3-8 words).",
          },
        },
        required: ["rename_confidence", "new_title"],
      },
    };

    return { prompt, specification };
  },

  parseResult(
    toolArguments: Record<string, unknown>,
    context: EvaluatorContext
  ): EvaluatorResult | null {
    const parsed = RenameResult.safeParse(toolArguments);
    if (!parsed.success) {
      return null;
    }

    const { rename_confidence, new_title } = parsed.data;

    if (
      rename_confidence < CONFIDENCE_THRESHOLD ||
      !new_title ||
      new_title.trim().toLowerCase() ===
        context.currentTitle.trim().toLowerCase()
    ) {
      return null;
    }

    return {
      suggestionType: "rename_title",
      metadata: { suggestedTitle: new_title },
    };
  },
};
