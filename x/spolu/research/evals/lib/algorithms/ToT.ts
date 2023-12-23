import seedrandom from "seedrandom";

import { Algorithm, AlgorithmType, TestResult } from "@app/lib/algorithms";
import { Dataset, Test } from "@app/lib/datasets";
import { ChatMessage, ChatQuery, Model } from "@app/lib/models";
import { LogProbModel } from "@app/lib/models/openai";

type Reasoning = {
  reasoning: string[];
  answer: string | null;
  score: number;
};

export class ToT extends Algorithm {
  readonly N_SHOT = 8;
  readonly EXPANSION_COUNT = 32;
  readonly POOL_SIZE = 3;
  readonly SAMPLE_COUNT_PER_EXPANSION = 8;
  readonly VOTING_POOL_SIZE = 8;
  readonly VOTING_ITERATIONS = 4;

  private finals: TestResult[] = [];
  private valueModel: LogProbModel = new LogProbModel();

  constructor(dataset: Dataset, model: Model) {
    super(dataset, model);
  }

  algorithm(): AlgorithmType {
    return "ToT";
  }

  async expand(
    test: Test,
    iteration: number,
    node: Reasoning
  ): Promise<Reasoning[]> {
    const examples = this.dataset.examples({
      problem: test.id,
      count: 3,
      iteration,
    });

    let prompt = `<Instructions>\n`;
    prompt += `${this.dataset.instructions()}`;
    prompt += "\n\n";
    prompt += `${this.dataset.reasoningStepInstructions()}`;
    prompt += `\n</Instructions>\n`;
    for (const example of examples) {
      prompt += `\n\n<Example>\n`;
      prompt += `QUESTION: ${example.question}\n`;
      prompt += `REASONING:\n${example.reasoning.join("\n")}\n`;
      prompt += `</Example>`;
    }
    prompt += `\n\n<Instructions>\n`;
    prompt += `Your goal is to provide ${this.SAMPLE_COUNT_PER_EXPANSION} alternate reasoning steps for the following question. One per line exactly. Each line you output will be considered a separate new reasoning step to explore.`;
    prompt += `\n</Instructions>`;

    const messages: ChatMessage[] = [];

    messages.push({
      role: "system",
      content: prompt,
    });

    const content =
      `QUESTION: ${test.question}\n` +
      `PARTIAL_REASONING:\n${node.reasoning.join("\n")}\n\n` +
      `Generate ${this.SAMPLE_COUNT_PER_EXPANSION} alternate additional reasoning steps` +
      ` (one per line) to advance by one step the PARTIAL_REASONING.` +
      ` Each line you output will be considered a separate new reasoning step to explore. Do not prepend the line with a number or any other character. No empty line. No full reasoning, just one reasoning step. 8 lines total.`;

    messages.push({
      role: "user",
      content,
    });

    // console.log(prompt);
    // messages.forEach((m) => {
    //   console.log(`+++++++++++++++++++++++++++++++`);
    //   console.log(`[${m.role}]`);
    //   console.log(`-------------------------------`);
    //   console.log(`${m.content}`);
    // });

    const query: ChatQuery = {
      provider: this.model.provider,
      model: this.model.model(),
      messages,
      temperature: 0.7,
      maxTokens:
        this.SAMPLE_COUNT_PER_EXPANSION *
        this.dataset.maxTokens().reasoningStep,
    };

    const c = await this.runCompletion(query);

    await this.storeCompletion({
      test,
      completion: c,
      query,
      check: false,
    });

    this.stats();

    // console.log(`+++++++++++++++++++++++++++++++`);
    // console.log(`RESPONSE`);
    // console.log(`-------------------------------`);
    // console.log(c.content);
    // console.log(`+++++++++++++++++++++++++++++++`);

    const new_nodes: Reasoning[] = [];
    const lines = c.content.split("\n");
    for (const line of lines) {
      const answer = this.dataset.parseAnswer(line);
      const new_node = {
        reasoning: [...node.reasoning, line],
        answer: answer.length > 0 ? answer : null,
        score: 0.0,
      };
      new_nodes.push(new_node);
    }
    return new_nodes;
  }

  async value(test: Test, iteration: number, pool: Reasoning[]) {
    const examples = this.dataset.examples({
      problem: test.id,
      count: 6,
      iteration,
    });

    let sharedPrefix = `<Instructions>\n`;
    sharedPrefix += `${this.dataset.instructions()}`;
    sharedPrefix += "\n\n";
    sharedPrefix += `Provide a reasoning consisting in multiple steps, using one line per step.`;
    sharedPrefix += ` ${this.dataset.reasoningStepInstructions()}`;
    sharedPrefix += `\n</Instructions>\n`;

    for (const e of examples.slice(0, 2)) {
      sharedPrefix += `\n\n<Example>\n`;
      sharedPrefix += `QUESTION: ${e.question}\n`;
      sharedPrefix += `REASONING:\n${e.reasoning.join("\n")}\n`;
      sharedPrefix += `</Example>`;
    }

    for (const p of pool) {
      let prefix = sharedPrefix;
      prefix += `\n\n<Example>\n`;
      prefix += `QUESTION: ${test.question}\n`;
      prefix += `REASONING:\n${p.reasoning.join("\n")}\n`;
      prefix += `</Example>`;

      let completion = "";
      for (const e of examples.slice(2)) {
        completion += `\n\n<Example>\n`;
        completion += `QUESTION: ${e.question}\n`;
        completion += `REASONING:\n${e.reasoning.join("\n")}\n`;
        completion += `</Example>`;
      }

      // console.log(`+++++++++++++++++++++++++++++++`);
      // console.log(`${prefix}`);
      // console.log(`-------------------------------`);
      // console.log(`${completion}`);
      // console.log(`+++++++++++++++++++++++++++++++`);

      p.score = await this.valueModel.value(prefix, completion);
    }
  }

  // async value(test: Test, iteration: number, pool: Reasoning[]) {
  //   const examples = this.dataset.examples({
  //     problem: test.id,
  //     count: 3,
  //     iteration,
  //   });

  //   let prompt = `INSTRUCTIONS:\n`;
  //   prompt += `${this.dataset.instructions()}`;
  //   prompt += "\n\n";
  //   prompt += `${this.dataset.reasoningStepInstructions()}`;
  //   prompt += "\n\n";
  //   prompt +=
  //     "Your goal is to rank the following (potentially partial) reasonings";
  //   prompt += " from the most promising to the least promising.\n\n";
  //   prompt += "Below are 3 examples of full valid reasonings:\n";
  //   for (const example of examples) {
  //     prompt += `QUESTION: ${example.question}\n`;
  //     prompt += `REASONING:\n${example.reasoning.join("\n")}\n\n`;
  //   }
  //   prompt +=
  //     "The format you should use for your response is the ranked, comma separated, list of reasoning indexes without spaces.";
  //   prompt +=
  //     " If there are, say, 5 proposed reasonings, a valid example would be `1,5,2,3,4`";
  //   prompt += " where `1` is the most promising and 4 the least promising.";
  //   prompt +=
  //     " If two reasonings are equally promising break the tie and follow the format.";

  //   const iterations =
  //     (pool.length / this.VOTING_POOL_SIZE) * this.VOTING_ITERATIONS;

  //   console.log(
  //     ">>>>>>>>>>>>>>>>>>>>>>>>>>> VOTIING",
  //     pool.length,
  //     this.VOTING_POOL_SIZE,
  //     this.VOTING_ITERATIONS,
  //     iterations
  //   );

  //   const rng = seedrandom(
  //     `TOT-VALUE-${test.id}-${iteration}-${pool
  //       .map((r) => r.reasoning.length)
  //       .join("-")}`
  //   );

  //   for (let i = 0; i < iterations; i++) {
  //     const messages: ChatMessage[] = [];

  //     messages.push({
  //       role: "system",
  //       content: prompt,
  //     });

  //     let content = `QUESTION: ${test.question}\n`;

  //     // select this.VOTING_POOL_SIZE reasonings randomly from pool
  //     const pool_idx: number[] = [];
  //     while (pool_idx.length < Math.min(pool.length, this.VOTING_POOL_SIZE)) {
  //       const idx = Math.floor(rng() * pool.length);
  //       if (!pool_idx.includes(idx)) {
  //         pool_idx.push(idx);
  //       }
  //     }

  //     for (let j = 0; j < pool_idx.length; j++) {
  //       const node = pool[pool_idx[j]];
  //       content += `\nREASONING index=${j + 1}:\n${node.reasoning.join(
  //         "\n"
  //       )}\n`;
  //     }

  //     content +=
  //       "\n\nWhen ranking reasonings take the following into consideration:\n";
  //     content += this.dataset.rankingInstructions();
  //     content +=
  //       "\nReply with a careful rationale about the reasonings (max 512 characters) and on the last line, the order of the reasonings ordered from most promising to least promising, comma separated REASONING indexes without space.";

  //     messages.push({
  //       role: "user",
  //       content,
  //     });

  //     // console.log(prompt);
  //     messages.forEach((m) =>
  //       console.log(`-------------------------\n${m.role}: ${m.content}`)
  //     );

  //     const query: ChatQuery = {
  //       provider: this.model.provider,
  //       model: this.model.model(),
  //       messages,
  //       temperature: 0.2,
  //       maxTokens: 2048,
  //     };

  //     const c = await this.runCompletion(query);

  //     await this.storeCompletion({
  //       test,
  //       completion: c,
  //       query,
  //       check: false,
  //     });

  //     this.stats();
  //     console.log(">>>> ", c.content);

  //     //extract the last string that matches the format
  //     const match = c.content.match(/\d+(,\d+)*/g);

  //     if (!match) {
  //       continue;
  //     }

  //     const ordering = match[match.length - 1]
  //       .split(",")
  //       .map((s) => parseInt(s) - 1);

  //     // compute score
  //     for (let j = 0; j < ordering.length; j++) {
  //       if (ordering[j] >= 0 && ordering[j] <= pool_idx.length) {
  //         const idx = pool_idx[ordering[j]];
  //         pool[idx].score += 1.0 / (j + 1);
  //       }
  //     }
  //   }
  // }

  async runOne({
    test,
  }: {
    test: Test;
    iteration?: number;
    debug?: boolean;
  }): Promise<TestResult> {
    let pool: Reasoning[] = [{ reasoning: [], answer: null, score: 0.0 }];

    for (
      let i = 0;
      i < Math.min(this.EXPANSION_COUNT, this.dataset.maxTokens().maxStepCount);
      i++
    ) {
      const p: Reasoning[] = [];
      for (const node of pool) {
        if (node.answer !== null) {
          p.push({
            reasoning: node.reasoning,
            answer: node.answer,
            score: 0.0,
          });
          continue;
        }
        const expanded = await this.expand(test, i, node);
        p.push(...expanded);
      }

      await this.value(test, i, p);
      p.sort((a, b) => b.score - a.score);
      // console.log("POOL: ", p);
      pool = p.slice(0, this.POOL_SIZE);

      // console.log("NEW POOL: ", pool);
      if (pool.filter((n) => n.answer === null).length === 0) {
        break;
      }
    }

    let answer = "";
    const a = pool.filter((n) => n.answer !== null);
    if (a.length > 0 && a[0].answer) {
      answer = a[0].answer;
    }

    let check = false;
    try {
      check = await this.dataset.check({ test, answer });
    } catch (e) {
      // Nothing to do, check failed.
    }

    console.log(`CHECK: problem=${test.id} answer=${answer} check=${check}`);

    const result: TestResult = {
      test,
      answer,
      check,
    };

    this.finals.push(result);
    return result;
  }

  computeResults(): void {
    console.log(
      `Result: algorithm=${this.algorithm()} dataset=${this.dataset.dataset} ` +
        `provider=${this.model.provider} model=${this.model.model()} ` +
        `check=${this.finals.filter((x) => x.check).length} total=${
          this.finals.length
        }`
    );
  }
}
