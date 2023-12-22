import * as fs from "fs";
import seedrandom from "seedrandom";

import { Dataset, Example, ProblemId, Test } from "@app/lib/datasets";

type ExampleMATH = {
  problem: string;
  name: string;
  level: number;
  type: string;
  answer: string;
  reasoning: string[];
};

export class MATH extends Dataset {
  readonly dataset = "MATH";
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
    const d: { [type: string]: { [level: number]: ExampleMATH[] } } = {};
    for (const e of examples) {
      if (!d[e.type]) {
        d[e.type] = {};
      }
      if (!d[e.type][e.level]) {
        d[e.type][e.level] = [];
      }
      d[e.type][e.level].push(e);
      // console.log(e.reasoning.length);
    }

    return d;
  }

  async load() {
    const train = await this.loadFile("datasets/MATH/train.jsonl");
    const test = await this.loadFile("datasets/MATH/test.jsonl");

    this.test = [];
    for (const type in test) {
      for (const level in test[type]) {
        this.test = this.test.concat(test[type][level]);
      }
    }

    const rng = seedrandom("MATH_DATASET");
    this.test = this.test.sort(() => rng() - 0.5);

    let train_count = 0;
    for (const type in train) {
      for (const level in train[type]) {
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
      "Find a solution to the provided mathematical problem." +
      " The answer is a unique mathematical expression presented in LaTeX `\\boxed{}` directive. " +
      " (example: `\\boxed{4}` or `\\boxed{3\\pi}`). Formatting instructions:" +
      " fractions should be represented in the LaTeX form `\\frac{a}{b}` (not `\\frac12`)," +
      " units should not be included," +
      " square roots should be presented in the LaTeX form `\\sqrt{c}` (not `\\sqrt2`)," +
      " all spaces and non critical parentheses or formatting should be stripped," +
      " rational numbers should be presented with a leading `0`."
    );
  }

  reasoningStepInstructions(): string {
    return (
      "A reasoning step is one coherent step of mathematical reasoning. It should hold in one line" +
      " of at most 500 characters." +
      " If an answer is reached as part of the reasoning, it should be included" +
      " in the reasoning step using the `\\boxed{}` directive." +
      " Don't use the `\\boxed{}` directive for anything else than the answer."
    );
  }

  rankingInstructions(): string {
    return (
      "- Each reasoning step should be mathetically correct, a reasoning with an incorrect step should be down-ranked.\n" +
      "- Reasonings should be concise. If a reasoning is too verbose it should be down-ranked.\n" +
      "- If a reasoning seems to explore a promising new direciton, it should be up-ranked.\n"
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
      reasoningStep: 256,
      maxStepCount: 16,
    };
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
    const t = this.test.find((e) => e.name === problem);
    if (!t) {
      throw new Error(`Unknown problem [examples]: dataset=MATH id=${problem}`);
    }
    let examples: ExampleMATH[] = [];
    for (const level in this.train[t.type]) {
      examples = examples.concat(this.train[t.type][level]);
    }

    // Shuffle differently for each call to examples.
    const rng = seedrandom(`MATH_DATASET-${problem}-${iteration}`);
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
    const t = this.test.find((e) => e.name === test.id);
    if (!t) {
      throw new Error(`Unknown problem [check]: dataset=MATH id=${test.id}`);
    }

    // remove spaces from answer
    answer = answer.replace(/\s/g, "");
    const truth = t.answer.replace(/\s/g, "");

    return answer === truth;
  }
}
