import type { UserQuestion, UserQuestionAnswer } from "@app/lib/actions/types";

export const USER_QUESTION_DECLINED_MESSAGE =
  "User declined to answer. Proceed with your best judgment.";

const CUSTOM_ANSWER_PREFIX = "Other: ";

export function getUserQuestionSelections(
  question: UserQuestion,
  answer: UserQuestionAnswer
): string[] {
  const selections: string[] = [];
  for (const idx of answer.selectedOptions) {
    if (idx >= 0 && idx < question.options.length) {
      selections.push(question.options[idx].label);
    }
  }
  if (answer.customResponse) {
    selections.push(`${CUSTOM_ANSWER_PREFIX}${answer.customResponse}`);
  }
  return selections;
}

export function formatUserQuestionAnswer(
  question: string,
  selections: string[]
): string {
  return (
    `User has answered your questions: "${question}"="${selections.join(", ")}". ` +
    `You can now continue with the user's answers in mind`
  );
}

export function parseUserQuestionAnswer(
  outputText: string
): {
  selectedLabels: string[];
  customAnswer: string | null;
} {
  const selectionsStart = outputText.indexOf('"="');
  if (selectionsStart === -1) {
    return { selectedLabels: [], customAnswer: null };
  }
  const start = selectionsStart + 3;
  const end = outputText.indexOf('".', start);
  if (end === -1) {
    return { selectedLabels: [], customAnswer: null };
  }

  const parts = outputText.slice(start, end).split(", ");
  const selectedLabels: string[] = [];
  let customAnswer: string | null = null;

  for (const part of parts) {
    if (part.startsWith(CUSTOM_ANSWER_PREFIX)) {
      customAnswer = part;
    } else {
      selectedLabels.push(part);
    }
  }

  return { selectedLabels, customAnswer };
}
