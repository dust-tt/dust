import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  UserQuestion,
  UserQuestionAnswerItem,
} from "@app/lib/actions/types";
import { isUserQuestionAnswers } from "@app/lib/actions/types";
import { ASK_USER_QUESTION_TOOLS_METADATA } from "@app/lib/api/actions/servers/ask_user_question/metadata";
import { Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

function formatAnswers(
  answers: UserQuestionAnswerItem[],
  questions: UserQuestion[]
): string {
  const parts: string[] = [];
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const a = answers[qi];
    if (!a) {
      continue;
    }
    const selections: string[] = [];
    for (const idx of a.selectedOptions) {
      if (idx >= 0 && idx < q.options.length) {
        selections.push(q.options[idx].label);
      }
    }
    if (a.customResponse) {
      selections.push(`Other: ${a.customResponse}`);
    }
    const answerText =
      selections.length > 0 ? selections.join(", ") : "No option selected";
    parts.push(`${q.question}: ${answerText}`);
  }
  return parts.join("\n");
}

const handlers: ToolHandlers<typeof ASK_USER_QUESTION_TOOLS_METADATA> = {
  ask_user_question: async ({ questions, metadata }, { agentLoopContext }) => {
    const typedQuestions: UserQuestion[] = questions.map((q) => ({
      question: q.question,
      options: q.options.map((o) => ({
        label: o.label,
        description: o.description,
      })),
      multiSelect: q.multi_select,
    }));

    // Check if we have a resume state with the user's answers.
    const resumeState = agentLoopContext?.runContext?.stepContext?.resumeState;
    const userAnswers =
      resumeState && typeof resumeState === "object" && "answer" in resumeState
        ? resumeState.answer
        : undefined;

    if (isUserQuestionAnswers(userAnswers)) {
      return new Ok([
        {
          type: "text",
          text: `User answered:\n${formatAnswers(userAnswers.answers, typedQuestions)}`,
        },
      ]);
    }

    // No answer yet — return a pause resource to block the agent loop.
    const summaryText = typedQuestions.map((q) => q.question).join("; ");

    return new Ok([
      {
        type: "resource",
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_user_question_required",
          questions: typedQuestions,
          metadata: metadata ?? null,
          text: `Asking user: ${summaryText}`,
          uri: "",
        },
      },
    ]);
  },
};

export const TOOLS = buildTools(ASK_USER_QUESTION_TOOLS_METADATA, handlers);
