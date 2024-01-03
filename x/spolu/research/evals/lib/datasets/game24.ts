import * as fs from "fs";
import { ConstantNode, evaluate, OperatorNode, parse } from "mathjs";
import seedrandom from "seedrandom";

import { Dataset, Example, ProblemId, Test } from "@app/lib/datasets";

type Example24 = {
  problem: string;
  rank: number;
  solutions: string[];
  // Above is parsed from 24.jsonl.
  // Below is filled by picking a solution and building the associated reasoning.
  solution?: string;
  reasoning?: string[];
};

export class Game24 extends Dataset {
  readonly dataset = "Game24";
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
        const r = `${a}${op}${b}=${result}, \\boxed{${solution}}`;
        reasoning.push(r);
      }
    }

    return {
      solution: `\\boxed{${solution}}`,
      reasoning,
    };
  }

  async load() {
    const rng = seedrandom("GAME24_DATASET");
    const data = await fs.promises.readFile("datasets/24/24.jsonl", "utf8");
    const lines = data.split("\n");
    const examples = lines
      .slice(900, 1156)
      .map((line) => JSON.parse(line) as Example24);

    const shuffled = examples.sort(() => rng() - 0.5);
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
      "Given a set of 4 input numbers, find a mathematical expression using each number" +
      " exactly once that symbolically evaluates to 24 (Game of 24)." +
      " The available operators are [+,-,*,/]" +
      " (the division operator / is the symbolic division (`2/(3-5/2) = 2/(1/2) = 4`))."
    );
  }

  reasoningStepInstructions(): string {
    return (
      "A reasoning step is one operation involving 2 numbers followed by the numbers left to form" +
      " 24 after that operation, separated by a comma (example: `10*7=70, left: 70 2 11`)." +
      " There is always exactly 3 reasoning steps per question in Game of 24." +
      " The last step should present the last operation and the solution expression" +
      " using the `\\boxed{}` directive" +
      " (example: `35-11=24, \\\boxed{(6+1)*5-11}`)." +
      " Don't use the `\\boxed{}` directive for anything else than the final step and answer." +
      " Inside the `\\boxed{}` directive only use numbers, and the symbols `+,-,*,/,(,)`."
    );
  }

  parseAnswer(str: string): string {
    const answers = [];
    let pending: string | null = null;
    let open = 0;
    for (let i = 0; i < str.length; i++) {
      if (pending === null) {
        if (str.slice(i, i + 7) === "\\boxed{") {
          pending = "\\boxed{";
          open = 1;
          i += 6;
        }
      } else {
        pending += str[i];
        if (str[i] === "{") {
          open++;
        }
        if (str[i] === "}") {
          open--;
        }
        if (open === 0) {
          answers.push(pending);
          pending = null;
        }
      }
    }

    if (answers.length === 0) {
      return "";
    } else {
      // return the last one
      return answers[answers.length - 1];
    }
  }

  maxTokens() {
    return {
      reasoningStep: 48,
      maxStepCount: 2 * (3 + 1), // account for answer and backtracking
    };
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

  async check({ test, answer }: { test: Test; answer: string }) {
    // remove the \boxed{} directive and trim
    const clean = answer.slice(7, answer.length - 1).trim();

    const node = parse(clean);
    const attempt: number[] = [];

    node.traverse(function (node) {
      switch (node.type) {
        case "ConstantNode":
          attempt.push((node as ConstantNode).value);
          break;
        default:
          break;
      }
    });
    if (attempt.length !== 4) {
      return false;
    }

    const truth = test.question.split(" ").map((s) => parseInt(s));

    const formulaSet = new Set(attempt);
    const truthSet = new Set(truth);

    if (formulaSet.size !== 4 || truthSet.size !== 4) {
      return false;
    }

    for (const f of attempt) {
      if (!truthSet.has(f)) {
        return false;
      }
    }
    for (const t of truth) {
      if (!formulaSet.has(t)) {
        return false;
      }
    }

    const result = evaluate(clean);
    if (result === 24) {
      return true;
    }

    return false;
  }
}
