import PQueue from "p-queue";

import { Dataset, ProblemId, Test } from "@app/lib/datasets";
import { ChatCompletion, Model } from "@app/lib/models";

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

  private history: {
    createdAt: number;
    test: ProblemId;
    completion: ChatCompletion;
    check: boolean;
  }[];

  constructor() {
    this.history = [];
  }

  storeCompletion({
    test,
    completion,
    check,
  }: {
    test: Test;
    check: boolean;
    completion: ChatCompletion;
  }): void {
    this.history.push({
      createdAt: Date.now(),
      test: test.id,
      completion,
      check,
    });
  }

  stats() {
    const now = Date.now();
    const window = this.history.filter((x) => x.createdAt > now - 60000);

    const s = {
      testPassed: this.history.filter((x) => x.check).length,
      testTotal: this.history.length,
      testRate: window.length / 60,
      completionTokensRate:
        window.reduce(
          (acc, x) => acc + x.completion.usage.completionTokens,
          0
        ) / 60,
      promptTokensRate:
        window.reduce((acc, x) => acc + x.completion.usage.promptTokens, 0) /
        60,
      completionTokensTotal: this.history.reduce(
        (acc, x) => acc + x.completion.usage.completionTokens,
        0
      ),
      promptTokensTotal: this.history.reduce(
        (acc, x) => acc + x.completion.usage.promptTokens,
        0
      ),
    };

    console.log(
      `Running stats: ` +
        `pass=${s.testPassed} ` +
        `total=${s.testTotal} ` +
        `rate=${s.testRate.toFixed(2)}/s ` +
        `promptTokensRate=${s.promptTokensRate.toFixed(3)}/s ` +
        `completionTokensRate=${s.completionTokensRate.toFixed(2)}/s ` +
        `promptTokensTotal=${s.promptTokensTotal} ` +
        `completionTokensTotal=${s.completionTokensTotal}`
    );
  }

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
    const queue = new PQueue({
      concurrency: CONCURRENCY,
    });

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
