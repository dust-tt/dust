import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { USER_ASK_QUESTION_TOOLS_METADATA } from "@app/lib/api/actions/servers/user_ask_question/metadata";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof USER_ASK_QUESTION_TOOLS_METADATA> = {
  ask_user_question: async (
    { question, options, allow_multiple },
    { agentLoopContext }
  ) => {
    const allowMultiple = allow_multiple ?? false;

    // Check if we have a resume state with the user's answer.
    const resumeState = agentLoopContext?.runContext?.stepContext?.resumeState;

    if (
      resumeState &&
      typeof resumeState === "object" &&
      "answer" in resumeState
    ) {
      const answer = resumeState.answer;
      const selectedOptions: number[] =
        answer && typeof answer === "object" && "selectedOptions" in answer
          ? (answer.selectedOptions as number[])
          : [];
      const customResponse: string | undefined =
        answer && typeof answer === "object" && "customResponse" in answer
          ? (answer.customResponse as string | undefined)
          : undefined;

      const parts: string[] = [];
      for (const idx of selectedOptions) {
        if (idx >= 0 && idx < options.length) {
          parts.push(options[idx].label);
        }
      }
      if (customResponse) {
        parts.push(customResponse);
      }

      const answerText =
        parts.length > 0 ? parts.join(", ") : "No option selected";

      return new Ok([
        {
          type: "text",
          text: `User answered: ${answerText}`,
        },
      ]);
    }

    // No answer yet — return a pause resource to block the agent loop.
    return new Ok([
      {
        type: "resource",
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_user_question_required",
          question,
          options,
          allowMultiple,
          text: `Asking user: ${question}`,
          uri: "",
        },
      },
    ]);
  },
};

export const TOOLS = buildTools(USER_ASK_QUESTION_TOOLS_METADATA, handlers);
