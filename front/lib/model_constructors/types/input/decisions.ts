export type DecisionPredicateQuestion = {
  type: "predicate";
  name: string;
  instructions: string;
};

export type DecisionChoiceQuestion = {
  type: "choice";
  name: string;
  instructions: string;
  choices: { value: string; description?: string }[];
};

// Levels are ordered from lowest to highest.
export type DecisionScoreQuestion = {
  type: "score";
  name: string;
  instructions: string;
  levels: { label: string; description?: string }[];
};

export type DecisionQuestion =
  | DecisionPredicateQuestion
  | DecisionChoiceQuestion
  | DecisionScoreQuestion;

export type DecisionRequest = {
  input: string;
  questions: DecisionQuestion[];
};

export type DecisionOptions = {
  signal?: AbortSignal;
};
