import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  isAgentLoopRunContext,
  isUserQuestionResumeState,
} from "@app/lib/actions/types";
import {
  formatUserQuestionAnswer,
  getUserQuestionSelections,
  isRankingAnswer,
  USER_QUESTION_DECLINED_MESSAGE,
} from "@app/lib/actions/user_question";
import { ASK_USER_QUESTION_TOOLS_METADATA } from "@app/lib/api/actions/servers/ask_user_question/metadata";
import { Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";

const handlers: ToolHandlers<typeof ASK_USER_QUESTION_TOOLS_METADATA> = {
  ask_user_question: async (
    { question, options, multiSelect, format },
    { runContext }
  ) => {
    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

    const resumeState = runContext.stepContext.resumeState;
    if (isUserQuestionResumeState(resumeState) && resumeState.answer) {
      const { answer } = resumeState;
      const userQuestion = { question, options, multiSelect, format };
      const selections = getUserQuestionSelections(userQuestion, answer);

      if (selections.length === 0) {
        return new Ok([
          {
            type: "text",
            text: USER_QUESTION_DECLINED_MESSAGE,
          },
        ]);
      }

      return new Ok([
        {
          type: "text",
          text: formatUserQuestionAnswer(question, selections, {
            isRanking: isRankingAnswer(userQuestion, answer),
          }),
        },
      ]);
    }

    return new Ok([
      {
        type: "resource",
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_user_answer_required",
          question: { question, options, multiSelect, format },
          text: `Asking user: ${question}`,
          uri: "",
        },
      },
    ]);
  },
};

export const TOOLS = buildTools(ASK_USER_QUESTION_TOOLS_METADATA, handlers);
