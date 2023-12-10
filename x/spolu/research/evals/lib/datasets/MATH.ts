import * as fs from "fs";
import seedrandom from "seedrandom";
import { Dataset, Example, ProblemId, Test } from "../datasets";

type ExampleMATH = {
  problem: string;
  name: string;
  level: number;
  type: string;
  answer: string;
  reasoning: string[];
};

class MATH extends Dataset {
  readonly name = "MATH";
  private train: { [type: string]: { [level: number]: ExampleMATH[] } } = {};
  private test: ExampleMATH[] = [];

  constructor() {
    super();
  }

  async loadFile(path: string) {
    const data = await fs.promises.readFile(path, "utf8");
    const lines = data.split("\n");
    const examples = lines
      .slice(0, lines.length - 1)
      .map((line) => JSON.parse(line) as ExampleMATH);
    let d: { [type: string]: { [level: number]: ExampleMATH[] } } = {};
    for (let e of examples) {
      if (!d[e.type]) {
        d[e.type] = {};
      }
      if (!d[e.type][e.level]) {
        d[e.type][e.level] = [];
      }
      d[e.type][e.level].push(e);
    }

    return d;
  }

  async load() {
    const train = await this.loadFile("datasets/MATH/train.jsonl");
    const test = await this.loadFile("datasets/MATH/test.jsonl");

    this.test = [];
    for (let type in test) {
      for (let level in test[type]) {
        this.test = this.test.concat(test[type][level]);
      }
    }

    let rng = seedrandom("MATH_DATASET");
    this.test = this.test.sort(() => rng() - 0.5);

    let train_count = 0;
    for (let type in train) {
      for (let level in train[type]) {
        train_count += train[type][level].length;
      }
    }
    this.train = train;

    console.log(
      `Loaded dataset: dataset=MATH train_count=${train_count} test_count=${this.test.length}`
    );
  }

  instructions(): string {
    return (
      `Given a set of 4 input numbers, find a mathematical expression using each number` +
      ` only once that symbolically evaluates to 24 (Game of 24).` +
      ` The available operators are [+,-,*,/]` +
      ` (the division operator / is the symbolic division (eg: 2/(3-5/2) = 2/(1/2) = 4)).` +
      ` The answer should be a valid solution expression without space` +
      ` (eg: \`(6+1+1)*3\` or \`12/(1-1/2)\`).`
    );
  }

  tests({ count }: { count: number }): Test[] {
    if (count > this.test.length) {
      throw new Error(
        `Not enough tests in dataset: dataset=MATH count=${count} test_count=${this.test.length}`
      );
    }
    return this.test.slice(0, count).map((e) => ({
      id: e.name,
      question: e.problem,
    }));
  }

  examples({
    problem,
    count,
    iteration,
  }: {
    problem: ProblemId;
    count: number;
    iteration: number;
  }): Example[] {
    let t = this.test.find((e) => e.name === problem);
    if (!t) {
      throw new Error(`Unknown problem [examples]: dataset=MATH id=${problem}`);
    }
    let examples: ExampleMATH[] = [];
    for (let level in this.train[t.type]) {
      examples = examples.concat(this.train[t.type][level]);
    }

    // Shuffle differently for each call to examples.
    let rng = seedrandom(`MATH_DATASET-${problem}-${iteration}`);
    examples = examples.sort(() => rng() - 0.5);

    if (count > examples.length) {
      throw new Error(
        `Not enough examples in dataset: dataset=MATH problem=${problem} ` +
          `count=${count} example_count=${examples.length}`
      );
    }

    return examples.slice(0, count).map((e) => ({
      id: e.name,
      question: e.problem,
      reasoning: e.reasoning || [],
      answer: e.answer,
    }));
  }

  async check({ test, answer }: { test: Test; answer: string }) {
    let t = this.test.find((e) => e.name === test.id);
    if (!t) {
      throw new Error(`Unknown problem [check]: dataset=MATH id=${test.id}`);
    }

    return t.answer === answer;
  }
}

(async () => {
  const d = new MATH();
  await d.load();
  const test = d.tests({ count: 1 });

  console.log(test[0]);

  console.log(
    await d.check({
      test: { id: test[0].id, question: test[0].question },
      answer: "\\boxed{x \\in [-2,7]}",
    })
  );
})();
