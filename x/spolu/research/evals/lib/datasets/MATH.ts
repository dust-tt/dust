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

// const FOCUS = [
//   // "algebra-l1-1142", // (15->16) [easy]
//   "algebra-l1-190", // (15->7)
//   // "algebra-l4-1057", // (3->0)
//   "counting_and_probability-l4-430", // (7->15)
//   // "counting_and_probability-l4-504", // (7->0)
//   "intermediate_algebra-l4-1588", // (0->2)
//   "intermediate_algebra-l4-1799", // (1->4)
//   "number_theory-l1-640", // (15->11)
//   "number_theory-l2-237", // (9->9)
//   // "number_theory-l3-511", // (13->16) [easy]
//   // "prealgebra-l5-1404", // (3->2)
//   "prealgebra-l5-2078", // (9->5)
//   // "precalculus-l2-1101", // (15->16) [easy]
//   "precalculus-l5-1115", // (0->3)
// ];

const FOCUS = [
  "algebra-l5-2176", // (2->12)
  "counting_and_probability-l5-1026", // (5->1)
  "geometry-l3-528", // (11->0)
  "intermediate_algebra-l3-1839", // (9->0)
  "number_theory-l1-640", // (10->0)
  "number_theory-l5-380", // (4->0)
  "prealgebra-l3-1392", // (5->12)
  "prealgebra-l5-1404", // (4->12)
  "prealgebra-l5-2078", // (7->0->12)
  "precalculus-l3-1024", // (8->0)
  "precalculus-l5-1115", // (0->11->3)
];
const MATH_FOCUS = false;

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

    if (MATH_FOCUS) {
      this.test = this.test.filter((e) => FOCUS.includes(e.name));
    }

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
      " The answer is a unique mathematical expression presented in LaTeX `\\boxed{}` directive." +
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
