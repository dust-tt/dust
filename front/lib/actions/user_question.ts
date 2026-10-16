import type { UserQuestion, UserQuestionAnswer } from "@app/lib/actions/types";

export const USER_QUESTION_DECLINED_MESSAGE =
  "User declined to answer. Proceed with your best judgment.";

const ANSWER_PREFIX = 'User has answered your question: "';
const ANSWER_SUFFIX =
  "\". You can now continue with the user's answers in mind.";
const RANKING_ANSWER_SUFFIX =
  '". The options are listed in the order the user ranked them, from highest to lowest ' +
  'priority. Options marked "Removed" were taken out of the ranking by the user. You can now ' +
  "continue with the user's answers in mind.";
const CUSTOM_ANSWER_PREFIX = "Other: ";
const REMOVED_OPTION_PREFIX = "Removed: ";

const MIN_RANKING_OPTIONS = 3;

/**
 * @cc [owner:aubin-tchoi,label:product] ranking-question
 * A question for which this returns true MUST be shown as a ranking of its options, from which the
 * user can remove all options but one. An answer to it with selected options MUST list the indexes
 * of the kept options in the order the user ranked them, and the answer text sent to the model
 * MUST name the removed options.
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
  // A ranking leaves out the options the user removed: name them so that the model does not read
  // their absence as an oversight.
  if (isRankingAnswer(question, answer)) {
    for (const [idx, option] of question.options.entries()) {
      if (!answer.selectedOptions.includes(idx)) {
        selections.push(`${REMOVED_OPTION_PREFIX}${option.label}`);
      }
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
  removedLabels: string[];
  customAnswer: string | null;
  isDeclined: boolean;
  isRanking: boolean;
} {
  const selectedLabels: string[] = [];
  const removedLabels: string[] = [];
  let customAnswer: string | null = null;
  let isDeclined = false;

  if (outputText === USER_QUESTION_DECLINED_MESSAGE) {
    return {
      selectedLabels,
      removedLabels,
      customAnswer,
      isDeclined: true,
      isRanking: false,
    };
  }

  const prefix = `${ANSWER_PREFIX}${question}"="`;
  const isRanking = outputText.endsWith(RANKING_ANSWER_SUFFIX);
  const suffix = isRanking ? RANKING_ANSWER_SUFFIX : ANSWER_SUFFIX;
  if (!outputText.startsWith(prefix) || !outputText.endsWith(suffix)) {
    return {
      selectedLabels,
      removedLabels,
      customAnswer,
      isDeclined,
      isRanking: false,
    };
  }

  const selectionsText = outputText.slice(
    prefix.length,
    outputText.length - suffix.length
  );

  for (const part of selectionsText.split(", ")) {
    if (part.startsWith(CUSTOM_ANSWER_PREFIX)) {
      customAnswer = part;
    } else if (isRanking && part.startsWith(REMOVED_OPTION_PREFIX)) {
      removedLabels.push(part.slice(REMOVED_OPTION_PREFIX.length));
    } else {
      selectedLabels.push(part);
    }
  }

  return { selectedLabels, removedLabels, customAnswer, isDeclined, isRanking };
}
