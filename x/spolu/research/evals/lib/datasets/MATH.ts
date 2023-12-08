import { Dataset, Example, ProblemId, Test } from "../datasets";
import * as fs from "fs";

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
  private train: ExampleMATH[] = [];
  private test: ExampleMATH[] = [];

  constructor() {
    super();
  }

  async loadFile(path: string): Promise<ExampleMATH[]> {
    const data = await fs.promises.readFile(path, "utf8");
    const lines = data.split("\n");
    return lines
      .slice(0, lines.length - 1)
      .map((line) => JSON.parse(line) as ExampleMATH);
  }

  async load() {
    this.test = await this.loadFile("datasets/MATH/test.jsonl");
    this.train = await this.loadFile("datasets/MATH/train.jsonl");

    let counts = {
      train: {},
      test: {},
    } as any;

    this.train.forEach((e) => {
      if (!counts.train[e.type]) {
        counts.train[e.type] = 0;
      }
      counts.train[e.type]++;
      console.log(`${e.type} ${e.level} ${e.name} ${e.answer}`);
    });
    console.log("-----------------------");
    this.test.forEach((e) => {
      if (!counts.test[e.type]) {
        counts.test[e.type] = 0;
      }
      counts.test[e.type]++;
      console.log(`${e.type} ${e.level} ${e.name} ${e.answer}`);
    });

    console.log(counts);

    // const shuffled = examples.sort(() => Math.random() - 0.5);
    // this.train = shuffled.slice(0, 128);
    // this.test = shuffled.slice(128, 256);

    console.log(
      `Loaded dataset: dataset=MATH train_count=${this.train.length} test_count=${this.test.length}`
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
    return this.test.slice(0, count).map((e) => ({
      id: e.problem,
      question: e.problem,
    }));
  }

  examples({
    problem,
    count,
  }: {
    problem: ProblemId;
    count: number;
  }): Example[] {
    return this.train.slice(0, count).map((e) => ({
      id: e.problem,
      question: e.problem,
      reasoning: e.reasoning || [],
      answer: e.answer,
    }));
  }

  async check({ test, answer }: { test: Test; answer: string }) {
    // const result = evaluate(answer);
    // if (result === 24) {
    //   return true;
    // }
    return false;
  }
}

(async () => {
  const d = new MATH();
  await d.load();
  // const train = d.examples({ problem: "", count: 8 });

  // console.log(train[0]);

  // console.log(
  //   d.check({
  //     test: { id: train[0].id, question: train[0].question },
  //     answer: train[0].answer,
  //   })
  // );
})();
