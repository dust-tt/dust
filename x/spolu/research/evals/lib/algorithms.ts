import { Dataset, Test } from "./datasets";

export type AlgorithmType = "CoT" | "CoT-consensus" | "ToT";

export type TestResult = {
  test: Test;
  answer: string;
  check: boolean;
};

export abstract class Algorithm {
  abstract readonly algorithm: AlgorithmType;

  abstract run({
    dataset,
    test,
  }: {
    dataset: Dataset;
    test: Test;
  }): Promise<TestResult>;
}
