import { AlgorithmType, TestResult, Algorithm } from "@app/lib/algorithms";
import { CoT } from "@app/lib/algorithms/CoT";
import { Dataset, ProblemId, Test } from "@app/lib/datasets";
import { ChatMessage, ChatQuery, Model } from "@app/lib/models";

type Reasoning = {
  reasoning: string[];
  answer: string | null;
  score: number;
};

export class ToT extends Algorithm {
  readonly N_SHOT = 8;
  readonly TEMPERATURE = 0.7;
  readonly EXPANSION_COUNT = 32;
  readonly POOL_SIZE = 5;
  readonly SAMPLE_COUNT_PER_EXPANSION = 5;
  readonly VOTING_POOL_SIZE = 5;
  readonly VOTING_ITERATIONS = 2;

  constructor(dataset: Dataset, model: Model) {
    super(dataset, model);
  }

  async expand(
    test: Test,
    iteration: number,
    node: Reasoning
  ): Promise<Reasoning> {
    const examples = this.dataset.examples({
      problem: test.id,
      count: this.N_SHOT,
      iteration,
    });

    const messages: ChatMessage[] = [];

    let prompt = `INSTRUCTIONS:\n`;
    prompt += ` ${this.dataset.instructions()}`;
    prompt += "\n\n";
    prompt += `${this.dataset.reasoningStepInstructions()}`;
    prompt += "\n\n";
    prompt += `Provide a single additional reasoning step.`;

    messages.push({
      role: "system",
      content: prompt,
    });

    for (const e of examples.slice(0, this.N_SHOT)) {
      const k = Math.floor(Math.random() * e.reasoning.length);
      const content =
        `QUESTION: ${e.question}\n` +
        `PARTIAL_REASONING:\n${e.reasoning.slice(0, k).join("\n")}\n\n` +
        `Generate one additional reasoning step.`;
      messages.push({
        role: "user",
        content,
      });
      messages.push({
        role: "assistant",
        content: `${e.reasoning[k]}`,
      });
    }

    const content =
      `QUESTION: ${test.question}\n` +
      `PARTIAL_REASONING:\n${node.reasoning.join("\n")}\n\n` +
      `Generate one additional reasoning step.`;

    messages.push({
      role: "user",
      content,
    });

    // console.log(prompt);
    // console.log(messages);

    const query: ChatQuery = {
      provider: this.model.provider,
      model: this.model.model(),
      messages,
      temperature: this.TEMPERATURE,
      maxTokens: this.dataset.maxTokens().reasoningStep,
    };

    const c = await this.runCompletion(query);

    await this.storeCompletion({
      test,
      completion: c,
      query,
      check: false,
    });

    const answer = this.dataset.parseAnswer(c.content);

    return {
      reasoning: [...node.reasoning, c.content],
      answer: answer.length > 0 ? answer : null,
      score: 0.0,
    };
  }

  async value(test: Test, iteration: number, pool: Reasoning[]) {
    let prompt = `INSTRUCTIONS:\n`;
    prompt += ` ${this.dataset.instructions()}`;
    prompt += "\n\n";
    prompt += `${this.dataset.reasoningStepInstructions()}`;
    prompt += "\n\n";
    prompt +=
      "Your goal is to order the following (potentially partial) reasonings";
    prompt += " from the most promising to the least promising.";
    prompt +=
      " The format you should use is the ordered, comma separated, list of reasoning indexes without spaces.";
    prompt +=
      " If there are, say, 5 proposed reasonings, an example would be `1,5,2,3,4` ";
    prompt += " where 1 is the most promising and 4 the least promising.";

    const iterations =
      (pool.length / this.VOTING_POOL_SIZE) * this.VOTING_ITERATIONS;

    for (let i = 0; i < iterations; i++) {
      const messages: ChatMessage[] = [];

      messages.push({
        role: "system",
        content: prompt,
      });

      // select this.VOTING_POOL_SIZE reasonings randomly from pool
      const pool_idx: number[] = [];
      while (pool_idx.length < this.VOTING_POOL_SIZE) {
        const idx = Math.floor(Math.random() * pool.length);
        if (!pool_idx.includes(idx)) {
          pool_idx.push(idx);
        }
      }
    }
  }

  async runOne({
    test,
    iteration,
    debug,
  }: {
    test: Test;
    iteration?: number;
    debug?: boolean;
  }): Promise<TestResult> {
    let pool: Reasoning[] = [{ reasoning: [], answer: null, score: 0.0 }];

    for (let i = 0; i < this.EXPANSION_COUNT; i++) {
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
        for (let j = 0; j < this.SAMPLE_COUNT_PER_EXPANSION; j++) {
          const expanded = await this.expand(test, i, node);
          p.push(expanded);
        }
      }

      // TODO(spolu) value and sort
      pool = p.slice(0, this.POOL_SIZE);
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

    return {
      test,
      answer,
      check,
    };
  }
}
