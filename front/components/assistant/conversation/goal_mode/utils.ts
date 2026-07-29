import type { GoalCreation } from "@app/types/assistant/goal";

export type ParsedGoalCommand = {
  input: string;
  goal: GoalCreation | undefined;
};

export function parseGoalCommand(
  markdown: string,
  isGoalModeEnabled: boolean
): ParsedGoalCommand {
  if (!isGoalModeEnabled) {
    return { input: markdown, goal: undefined };
  }

  const match = markdown.match(/^\/goal\s+([\s\S]*\S)\s*$/i);
  if (!match) {
    return { input: markdown, goal: undefined };
  }

  const objective = match[1].trim();
  return {
    input: objective,
    goal: { objective },
  };
}
