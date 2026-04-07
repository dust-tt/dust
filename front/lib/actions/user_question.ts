import type { UserQuestion, UserQuestionAnswer } from "@app/lib/actions/types";

export const USER_QUESTION_DECLINED_MESSAGE =
  "User declined to answer. Proceed with your best judgment.";

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
    selections.push(`Other: ${answer.customResponse}`);
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

export function parseUserQuestionSelections(outputText: string): string[] {
  const selectionsStart = outputText.indexOf('"="');
  if (selectionsStart === -1) {
    return [];
  }
  const start = selectionsStart + 3;
  const end = outputText.indexOf('".', start);
  if (end === -1) {
    return [];
  }
  return outputText.slice(start, end).split(", ");
}
