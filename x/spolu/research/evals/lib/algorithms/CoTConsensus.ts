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

  resultFromPool(poolSize: number, test: Test): TestResult {
    const answers: { [key: string]: { check: boolean; count: number } } = {};

    for (const result of this.poolResults[test.id].slice(0, poolSize)) {
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

    return {
      test,
      answer: maxAnswer,
      check: maxCheck,
    };
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

    return this.resultFromPool(this.VOTE_COUNT, test);
  }

  computeResults(): void {
    for (let p = 1; p <= this.VOTE_COUNT; p = p * 2) {
      let check = 0;
      let total = 0;

      for (const testId in this.poolResults) {
        const test = this.poolResults[testId][0].test;
        const result = this.resultFromPool(p, test);
        total++;
        if (result.check) {
          check++;
        }
      }

      console.log(
        `Result: algorithm=${this.algorithm()} poolSize=${p} dataset=${
          this.dataset.dataset
        } ` +
          `provider=${this.model.provider} model=${this.model.model()} ` +
          `check=${check} total=${total}`
      );
    }
  }
}
