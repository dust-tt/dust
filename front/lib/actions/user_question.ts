import type { UserQuestion, UserQuestionAnswer } from "@app/lib/actions/types";

export const USER_QUESTION_DECLINED_MESSAGE =
  "User declined to answer. Proceed with your best judgment.";

const ANSWER_PREFIX = 'User has answered your question: "';
const ANSWER_SUFFIX =
  "\". You can now continue with the user's answers in mind.";
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
  return `${ANSWER_PREFIX}${question}"="${selections.join(", ")}${ANSWER_SUFFIX}`;
}

export function parseUserQuestionAnswer(
  outputText: string,
  question: string
): {
  selectedLabels: string[];
  customAnswer: string | null;
  isDeclined: boolean;
} {
  const selectedLabels: string[] = [];
  let customAnswer: string | null = null;
  let isDeclined = false;

  if (outputText === USER_QUESTION_DECLINED_MESSAGE) {
    return { selectedLabels, customAnswer, isDeclined: true };
  }

  const prefix = `${ANSWER_PREFIX}${question}"="`;
  if (!outputText.startsWith(prefix) || !outputText.endsWith(ANSWER_SUFFIX)) {
    return { selectedLabels, customAnswer, isDeclined };
  }

  const selectionsText = outputText.slice(
    prefix.length,
    outputText.length - ANSWER_SUFFIX.length
  );

  for (const part of selectionsText.split(", ")) {
    if (part.startsWith(CUSTOM_ANSWER_PREFIX)) {
      customAnswer = part;
    } else {
      selectedLabels.push(part);
    }
  }

  return { selectedLabels, customAnswer, isDeclined };
}
