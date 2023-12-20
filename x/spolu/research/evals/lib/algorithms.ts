import PQueue from "p-queue";
import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";

import { Dataset, ProblemId, Test } from "@app/lib/datasets";
import { ChatCompletion, ChatQuery, hashQuery, Model } from "@app/lib/models";

export const ValidAlgorithmTypes = ["CoT", "CoT-consensus"] as const;
export type AlgorithmType = (typeof ValidAlgorithmTypes)[number];

export type TestResult = {
  test: Test;
  answer: string;
  check: boolean;
};

export abstract class Algorithm {
  private history: {
    createdAt: number;
    runId: string;
    test: ProblemId;
    queryHash: string;
    completion: ChatCompletion;
    check: boolean;
  }[];

  private _sqlite: Database | null = null;

  protected dataset: Dataset;
  protected model: Model;

  constructor(dataset: Dataset, model: Model) {
    this.history = [];
    this.dataset = dataset;
    this.model = model;
  }

  abstract algorithm(): AlgorithmType;

  async sqlite() {
    if (this._sqlite === null) {
      this._sqlite = await open({
        filename: `stores/${this.runId()}.sqlite`,
        driver: sqlite3.Database,
      });
      // this._sqlite = new Database(`stores/${this.runId()}.sqlite`);
      const query =
        "CREATE TABLE IF NOT EXISTS store (" +
        "id BIGSERIAL PRIMARY KEY, " +
        "created_at INTEGER NOT NULL, " +
        "run_id TEXT NOT NULL, " +
        "test TEXT NOT NULL, " +
        "query_hash TEXT NOT NULL, " +
        "completion TEXT NOT NULL, " +
        "is_check INTEGER NOT NULL" +
        ")";
      await this._sqlite.exec(query);
    }
    return this._sqlite;
  }

  runId(): string {
    return `${this.model.provider}-${this.model.model()}-${
      this.dataset.dataset
    }-${this.algorithm()}`;
  }

  async storeCompletion({
    test,
    query,
    completion,
    check,
  }: {
    test: Test;
    query: ChatQuery;
    completion: ChatCompletion;
    check: boolean;
  }) {
    const db = await this.sqlite();

    const now = Date.now();

    await db.run(
      "INSERT INTO store (created_at, run_id, test, query_hash, completion, is_check) VALUES (?, ?, ?, ?, ?, ?)",
      [
        now,
        this.runId(),
        test.id,
        hashQuery(query),
        JSON.stringify(completion),
        check ? 1 : 0,
      ]
    );

    this.history.push({
      createdAt: now,
      runId: this.runId(),
      test: test.id,
      queryHash: hashQuery(query),
      completion,
      check,
    });
  }

  async runCompletion(query: ChatQuery): Promise<ChatCompletion> {
    const db = await this.sqlite();

    const result = await db.get(
      "SELECT * FROM store WHERE run_id = ? AND query_hash = ?",
      [this.runId(), hashQuery(query)]
    );
    if (result) {
      return JSON.parse(result.completion);
    }

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

  finalStats() {
    if (this.history.length > 1) {
      const first = this.history[0];
      const last = this.history[this.history.length - 1];
      const duration = last.createdAt - first.createdAt;
      const rate = this.history.length / (duration / 1000);
      const completionTokensTotal = this.history.reduce(
        (acc, x) => acc + x.completion.usage.completionTokens,
        0
      );
      const promptTokensTotal = this.history.reduce(
        (acc, x) => acc + x.completion.usage.promptTokens,
        0
      );

      console.log(
        `Final stats: ` +
          `rate=${rate.toFixed(2)}/s ` +
          `promptTokensTotal=${promptTokensTotal} ` +
          `completionTokensTotal=${completionTokensTotal}`
      );
    }
  }

  abstract runOne({
    test,
    debug,
    iteration,
  }: {
    test: Test;
    debug?: boolean;
    iteration?: number;
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

  abstract computeResults(): void;
}
