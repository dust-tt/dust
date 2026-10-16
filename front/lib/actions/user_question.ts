import type { UserQuestion, UserQuestionAnswer } from "@app/lib/actions/types";

export const USER_QUESTION_DECLINED_MESSAGE =
  "User declined to answer. Proceed with your best judgment.";

const ANSWER_PREFIX = 'User has answered your question: "';
const ANSWER_SUFFIX =
  "\". You can now continue with the user's answers in mind.";
const RANKING_ANSWER_SUFFIX =
  '". The options are listed in the order the user ranked them, from highest to lowest ' +
  "priority. You can now continue with the user's answers in mind.";
const CUSTOM_ANSWER_PREFIX = "Other: ";

const MIN_RANKING_OPTIONS = 3;

/**
 * @cc [owner:aubin-tchoi,label:product] ranking-question
 * A question for which this returns true MUST be shown as a ranking of all its options, and an
 * answer to it with selected options MUST list every option index, in the order the user ranked
 * them.
 */
export function isRankingQuestion(question: UserQuestion): boolean {
  return (
    question.format === "ranking" &&
    question.options.length >= MIN_RANKING_OPTIONS
  );
}

export function isRankingAnswer(
  question: UserQuestion,
  answer: UserQuestionAnswer
): boolean {
  return isRankingQuestion(question) && answer.selectedOptions.length > 0;
}

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
  selections: string[],
  { isRanking }: { isRanking: boolean }
): string {
  const suffix = isRanking ? RANKING_ANSWER_SUFFIX : ANSWER_SUFFIX;
  return `${ANSWER_PREFIX}${question}"="${selections.join(", ")}${suffix}`;
}

export function parseUserQuestionAnswer(
  outputText: string,
  question: string
): {
  selectedLabels: string[];
  customAnswer: string | null;
  isDeclined: boolean;
  isRanking: boolean;
} {
  const selectedLabels: string[] = [];
  let customAnswer: string | null = null;
  let isDeclined = false;

  if (outputText === USER_QUESTION_DECLINED_MESSAGE) {
    return { selectedLabels, customAnswer, isDeclined: true, isRanking: false };
  }

  const prefix = `${ANSWER_PREFIX}${question}"="`;
  const isRanking = outputText.endsWith(RANKING_ANSWER_SUFFIX);
  const suffix = isRanking ? RANKING_ANSWER_SUFFIX : ANSWER_SUFFIX;
  if (!outputText.startsWith(prefix) || !outputText.endsWith(suffix)) {
    return { selectedLabels, customAnswer, isDeclined, isRanking: false };
  }

  const selectionsText = outputText.slice(
    prefix.length,
    outputText.length - suffix.length
  );

  for (const part of selectionsText.split(", ")) {
    if (part.startsWith(CUSTOM_ANSWER_PREFIX)) {
      customAnswer = part;
    } else {
      selectedLabels.push(part);
    }
  }

  return { selectedLabels, customAnswer, isDeclined, isRanking };
}
