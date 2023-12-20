import { AlgorithmType, TestResult } from "@app/lib/algorithms";
import { CoT } from "@app/lib/algorithms/CoT";
import { Dataset, ProblemId, Test } from "@app/lib/datasets";
import { Model } from "@app/lib/models";

export class CoTConsensus extends CoT {
  readonly VOTE_COUNT = 32;

  private poolResults: { [key: ProblemId]: TestResult[] };

  constructor(dataset: Dataset, model: Model) {
    super(dataset, model);
    this.poolResults = {};
  }

  algorithm(): AlgorithmType {
    return "CoT-consensus";
  }

  resultFromPool(poolSize: number, test: Test): TestResult[] {
    const results: TestResult[] = [];

    for (let i = 1; i * poolSize <= this.poolResults[test.id].length; i++) {
      const answers: { [key: string]: { check: boolean; count: number } } = {};

      const pool = this.poolResults[test.id].slice(
        (i - 1) * poolSize,
        i * poolSize
      );

      for (const result of pool) {
        if (!answers[result.answer]) {
          answers[result.answer] = { check: result.check, count: 0 };
        }
        answers[result.answer].count++;
      }

      // find the max count
      let maxCount = 0;
      let maxAnswer = "";
      let maxCheck = false;
      for (const answer in answers) {
        if (answers[answer].count > maxCount) {
          maxCount = answers[answer].count;
          maxAnswer = answer;
          maxCheck = answers[answer].check;
        }
      }
      results.push({ test, answer: maxAnswer, check: maxCheck });
    }

    return results;
  }

  async runOne({
    test,
    debug,
  }: {
    test: Test;
    debug?: boolean;
  }): Promise<TestResult> {
    for (let i = 0; i < this.VOTE_COUNT; i++) {
      const result = await super.runOne({ test, debug, iteration: i });
      if (!this.poolResults[test.id]) {
        this.poolResults[test.id] = [];
      }
      this.poolResults[test.id].push(result);
    }
    return this.resultFromPool(this.VOTE_COUNT, test)[0];
  }

  computeResults(): void {
    for (let p = 1; p <= this.VOTE_COUNT; p = p * 2) {
      const pools: TestResult[][] = [];
      for (let i = 0; i < this.VOTE_COUNT / p; i++) {
        pools.push([]);
      }

      for (const testId in this.poolResults) {
        const test = this.poolResults[testId][0].test;
        const results = this.resultFromPool(p, test);

        if (results.length !== pools.length) {
          throw new Error(
            `Expected ${pools.length} pools, got ${results.length}`
          );
        }

        for (let i = 0; i < results.length; i++) {
          pools[i].push(results[i]);
        }
      }

      const check = [];
      const total = [];

      for (const pool of pools) {
        let checkCount = 0;
        let totalCount = 0;
        for (const result of pool) {
          if (result.check) {
            checkCount++;
          }
          totalCount++;
        }
        check.push(checkCount);
        total.push(totalCount);
      }

      const checkAvg = check.reduce((a, b) => a + b, 0) / check.length;
      const totalAvg = total.reduce((a, b) => a + b, 0) / total.length;

      console.log(
        `Result: algorithm=${this.algorithm()} poolSize=${p} dataset=${
          this.dataset.dataset
        } ` +
          `provider=${this.model.provider} model=${this.model.model()} ` +
          `check=${checkAvg.toFixed(2)} total=${totalAvg.toFixed(2)}`
      );
    }
  }
}
