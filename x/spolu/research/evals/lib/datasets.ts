export type DatasetType = "MATH" | "Game24";

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
  abstract readonly name: DatasetType;

  abstract load(): Promise<void>;

  abstract instructions(): string;

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
