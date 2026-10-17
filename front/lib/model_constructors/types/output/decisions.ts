import type { TokenUsageContent } from "@app/lib/model_constructors/types/output/events";

export type DecisionPredicateAnswer = {
  type: "predicate";
  name: string;
  probability: number;
};

export type DecisionChoiceAnswer = {
  type: "choice";
  name: string;
  choice: string;
  confidence: number;
  probabilities: { value: string; probability: number }[];
};

// `value` is the level index, 0 being the lowest level.
export type DecisionScoreAnswer = {
  type: "score";
  name: string;
  score: number;
  confidence: number;
  probabilities: { label: string; value: number; probability: number }[];
};

export type DecisionAnswer =
  | DecisionPredicateAnswer
  | DecisionChoiceAnswer
  | DecisionScoreAnswer;

export type DecisionResult = {
  answers: DecisionAnswer[];
  usage: TokenUsageContent;
};
