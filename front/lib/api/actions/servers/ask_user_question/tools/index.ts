import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isUserQuestionResumeState } from "@app/lib/actions/types";
import { ASK_USER_QUESTION_TOOLS_METADATA } from "@app/lib/api/actions/servers/ask_user_question/metadata";
import { Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

const handlers: ToolHandlers<typeof ASK_USER_QUESTION_TOOLS_METADATA> = {
  ask_user_question: async (
    { question, options, multiSelect },
    { agentLoopContext }
  ) => {
    const resumeState = agentLoopContext?.runContext?.stepContext?.resumeState;
    if (isUserQuestionResumeState(resumeState) && resumeState.answer) {
      const { answer } = resumeState;
      const selections: string[] = [];
      for (const idx of answer.selectedOptions) {
        if (idx >= 0 && idx < options.length) {
          selections.push(options[idx].label);
        }
      }
      if (answer.customResponse) {
        selections.push(`Other: ${answer.customResponse}`);
      }

      if (selections.length === 0) {
        return new Ok([
          {
            type: "text",
            text: "User declined to answer. Proceed with your best judgment.",
          },
        ]);
      }

      return new Ok([
        {
          type: "text",
          text:
            `User has answered your questions: "${question}"="${selections.join(", ")}". ` +
            "You can now continue with the user's answers in mind",
        },
      ]);
    }

    return new Ok([
      {
        type: "resource",
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_user_answer_required",
          question: { question, options, multiSelect },
          text: `Asking user: ${question}`,
          uri: "",
        },
      },
    ]);
  },
};

export const TOOLS = buildTools(ASK_USER_QUESTION_TOOLS_METADATA, handlers);
