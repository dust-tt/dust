import * as fs from "fs";
import { ConstantNode, evaluate, OperatorNode, parse } from "mathjs";
import seedrandom from "seedrandom";

import { Dataset, Example, ProblemId, Test } from "../datasets";

type Example24 = {
  problem: string;
  rank: number;
  solutions: string[];
  // Above is parsed from 24.jsonl.
  // Below is filled by picking a solution and building the associated reasoning.
  solution?: string;
  reasoning?: string[];
};

class Game24 extends Dataset {
  readonly name = "Game24";
  private train: Example24[] = [];
  private test: Example24[] = [];

  constructor() {
    super();
  }

  build_reasoning({ problem }: { problem: Example24 }): {
    solution: string;
    reasoning: string[];
  } {
    const solution = problem.solutions[0];
    const node = parse(solution);
    const formula: (string | number)[] = [];
    node.traverse(function (node) {
      switch (node.type) {
        case "OperatorNode":
          formula.push((node as OperatorNode).op);
          break;
        case "ConstantNode":
          formula.push((node as ConstantNode).value);
          break;
        case "ParenthesisNode":
          break;
        default:
          break;
      }
    });
    // console.log(">> " + formula.join(" "));

    const reasoning = [];
    while (formula.length > 1) {
      // Find the first operator followed by numbers.
      let index = 0;
      while (index < formula.length - 2) {
        if (
          typeof formula[index] === "string" &&
          typeof formula[index + 1] === "number" &&
          typeof formula[index + 2] === "number"
        ) {
          break;
        }
        index++;
      }

      // Apply the operator to the two numbers.
      const op = formula[index] as string;
      const a = formula[index + 1] as number;
      const b = formula[index + 2] as number;
      // console.log(`${a} ${op} ${b}`);
      const result = evaluate(`${a} ${op} ${b}`);

      // Replace 3 entries with the result.
      formula.splice(index, 3, result);

      if (formula.length > 1) {
        const r = `${a}${op}${b}=${result}, left: ${formula
          .filter((a) => typeof a === "number")
          .join(" ")}`;
        reasoning.push(r);
      } else {
        if (result !== 24) {
          throw new Error("Unexpected non 24 result");
        }
        const r = `${a}${op}${b}=${result}`;
        reasoning.push(r);
      }
    }

    return {
      solution,
      reasoning,
    };
  }

  async load() {
    const data = await fs.promises.readFile("datasets/24/24.jsonl", "utf8");
    const lines = data.split("\n");
    const examples = lines
      .slice(900, 1156)
      .map((line) => JSON.parse(line) as Example24);

    const shuffled = examples.sort(() => Math.random() - 0.5);
    this.train = shuffled.slice(0, 128);
    this.test = shuffled.slice(128, 256);

    this.train.forEach((e) => {
      const { solution, reasoning } = this.build_reasoning({ problem: e });
      e.solution = solution;
      e.reasoning = reasoning;
    });

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
    // Shuffle differently for each call to examples.
    const rng = seedrandom(`GAME-24_DATASET-${problem}-${iteration}`);
    let examples = [...this.train];
    examples = examples.sort(() => rng() - 0.5);

    if (count > examples.length) {
      throw new Error(
        `Not enough examples in dataset: dataset=Game24 problem=${problem} ` +
          `count=${count} example_count=${examples.length}`
      );
    }

    return examples.slice(0, count).map((e) => ({
      id: e.problem,
      question: e.problem,
      reasoning: e.reasoning || [],
      answer: e.solution || e.solutions[0],
    }));
  }

  async check({ answer }: { test: Test; answer: string }) {
    const result = evaluate(answer);
    if (result === 24) {
      return true;
    }
    return false;
  }
}

async function main() {
  const d = new Game24();
  await d.load();
  const train = d.examples({ problem: "", count: 8, iteration: 0 });

  console.log(train[0]);

  console.log(
    await d.check({
      test: { id: train[0].id, question: train[0].question },
      answer: train[0].answer,
    })
  );
}

main()
  .then(() => console.log("Done"))
  .catch(console.error);
