// Make an array and then a type of the array

export const ValidDatasetTypes = ["MATH", "Game24"] as const;
export type DatasetType = (typeof ValidDatasetTypes)[number];

export type ProblemId = string;

export type Example = {
  id: ProblemId;
  question: string;
  reasoning: string[];
  answer: string;
};

export type Test = {
  id: ProblemId;
  question: string;
};

export abstract class Dataset {
  abstract readonly dataset: DatasetType;

  abstract load(): Promise<void>;

  abstract instructions(): string;
  abstract reasoningStepInstructions(): string;

  abstract maxTokens(): {
    reasoningStep: number;
    maxStepCount: number;
  };

  abstract parseAnswer(str: string): string;

  abstract tests({ count }: { count: number }): Test[];

  abstract examples({
    problem,
    count,
    iteration,
  }: {
    problem: ProblemId;
    count: number;
    iteration: number;
  }): Example[];

  abstract check({
    test,
    answer,
  }: {
    test: Test;
    answer: string;
  }): Promise<boolean>;
}
