import PQueue from "p-queue";

import { Dataset, ProblemId, Test } from "@app/lib/datasets";
import { ChatCompletion, ChatQuery, hashQuery, Model } from "@app/lib/models";

export const ValidAlgorithmTypes = ["CoT"] as const;
export type AlgorithmType = (typeof ValidAlgorithmTypes)[number];

export type TestResult = {
  test: Test;
  answer: string;
  check: boolean;
};

export abstract class Algorithm {
  abstract readonly algorithm: AlgorithmType;

  private history: {
    createdAt: number;
    runId: string;
    test: ProblemId;
    queryHash: string;
    completion: ChatCompletion;
    check: boolean;
  }[];

  protected dataset: Dataset;
  protected model: Model;

  constructor(dataset: Dataset, model: Model) {
    this.history = [];
    this.dataset = dataset;
    this.model = model;
  }

  runId(): string {
    return `${this.model.provider}-${this.model.model()}-${
      this.dataset.dataset
    }-${this.algorithm}`;
  }

  storeCompletion({
    test,
    query,
    completion,
    check,
  }: {
    test: Test;
    query: ChatQuery;
    completion: ChatCompletion;
    check: boolean;
  }): void {
    this.history.push({
      createdAt: Date.now(),
      runId: this.runId(),
      test: test.id,
      queryHash: hashQuery(query),
      completion,
      check,
    });
  }

  async runCompletion(query: ChatQuery): Promise<ChatCompletion> {
    return await this.model.completionWithRetry(query);
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
    test,
    debug,
  }: {
    test: Test;
    debug?: boolean;
  }): Promise<TestResult>;

  async run({
    tests,
    concurrency,
    debug,
  }: {
    tests: Test[];
    concurrency: number;
    debug?: boolean;
  }): Promise<TestResult[]> {
    const queue = new PQueue({
      concurrency,
    });

    const results = (
      await Promise.all(
        tests.map((test) => queue.add(() => this.runOne({ test, debug })))
      )
    ).filter((x) => x);

    if (results.length !== tests.length) {
      throw new Error("Missing results");
    }

    return results as TestResult[];
  }
}
