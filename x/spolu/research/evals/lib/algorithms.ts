import PQueue from "p-queue";

import { Dataset, Test } from "@app/lib/datasets";
import { Model } from "@app/lib/models";

export const ValidAlgorithmTypes = ["CoT"] as const;
export type AlgorithmType = (typeof ValidAlgorithmTypes)[number];

export type TestResult = {
  test: Test;
  answer: string;
  check: boolean;
};

const CONCURRENCY = 4;

export abstract class Algorithm {
  abstract readonly algorithm: AlgorithmType;

  abstract runOne({
    model,
    dataset,
    test,
    debug,
  }: {
    model: Model;
    dataset: Dataset;
    test: Test;
    debug?: boolean;
  }): Promise<TestResult>;

  async run({
    model,
    dataset,
    tests,
    debug,
  }: {
    model: Model;
    dataset: Dataset;
    tests: Test[];
    debug?: boolean;
  }): Promise<TestResult[]> {
    const queue = new PQueue({ concurrency: CONCURRENCY });

    const results = (
      await Promise.all(
        tests.map((test) =>
          queue.add(() => this.runOne({ model, dataset, test, debug }))
        )
      )
    ).filter((x) => x);

    if (results.length !== tests.length) {
      throw new Error("Missing results");
    }

    return results as TestResult[];
  }
}
