import { Dataset, Example, ProblemId, Test } from "../datasets";
import * as fs from "fs";
// import { evaluate, parse } from "mathjs";

type Example24 = {
  problem: string;
  rank: number;
  solutions: string[];
};

class Game24 extends Dataset {
  readonly name = "Game24";
  private train: Example24[] = [];
  private test: Example24[] = [];

  constructor() {
    super();
  }

  async load(): Promise<void> {
    const data = await fs.promises.readFile("datasets/24/24.jsonl", "utf8");
    const lines = data.split("\n");
    const examples = lines
      .slice(900, 1156)
      .map((line) => JSON.parse(line) as Example24);

    const shuffled = examples.sort(() => Math.random() - 0.5);
    this.train = shuffled.slice(0, 128);
    this.test = shuffled.slice(128, 256);

    console.log(
      `Loaded dataset: dataset=Game24 train_count=${this.train.length} test_count=${this.test.length}`
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
      answer: e.solutions[0],
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
      reasoning: e.solutions[0],
      answer: e.solutions[0],
    }));
  }
}

(async () => {
  const d = new Game24();
  await d.load();
  const train = d.examples({ problem: "", count: 10 });

  console.log(train[0].answer);
  // const node = parse(train[0].answer);

  // node.traverse(function (node, path, parent) {
  //   switch (node.type) {
  //     case "OperatorNode":
  //       console.log(node.type, node.op);
  //       break;
  //     case "ConstantNode":
  //       console.log(node.type, node.value);
  //       break;
  //     case "SymbolNode":
  //       console.log(node.type, node.name);
  //       break;
  //     default:
  //       console.log(node.type);
  //   }
  // });
})();
