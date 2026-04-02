import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { UserQuestion } from "@app/lib/actions/types";
import { UserQuestionAnswerSchema } from "@app/lib/actions/types";
import { ASK_USER_QUESTION_TOOLS_METADATA } from "@app/lib/api/actions/servers/ask_user_question/metadata";
import { Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

const handlers: ToolHandlers<typeof ASK_USER_QUESTION_TOOLS_METADATA> = {
  ask_user_question: async (
    { question, options, multiSelect },
    { agentLoopContext }
  ) => {
    const typedQuestion: UserQuestion = {
      question,
      options,
      multiSelect,
    };

    const resumeState = agentLoopContext?.runContext?.stepContext?.resumeState;
    const parsed = UserQuestionAnswerSchema.safeParse(
      resumeState && "answer" in resumeState
        ? resumeState.answer
        : undefined
    );

    if (parsed.success) {
      const answer = parsed.data;
      const selections: string[] = [];
      for (const idx of answer.selectedOptions) {
        if (idx >= 0 && idx < typedQuestion.options.length) {
          selections.push(typedQuestion.options[idx].label);
        }
      }
      if (answer.customResponse) {
        selections.push(`Other: ${answer.customResponse}`);
      }

      return new Ok([
        {
          type: "text",
          text: `User answered: ${typedQuestion.question}: ${selections.join(", ")}`,
        },
      ]);
    }

    return new Ok([
      {
        type: "resource",
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_user_answer_required",
          question: typedQuestion,
          text: `Asking user: ${typedQuestion.question}`,
          uri: "",
        },
      },
    ]);
  },
};

export const TOOLS = buildTools(ASK_USER_QUESTION_TOOLS_METADATA, handlers);
