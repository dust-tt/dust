import { Algorithm, AlgorithmType, TestResult } from "@app/lib/algorithms";
import { Dataset, Test } from "@app/lib/datasets";
import { ChatMessage, ChatQuery, Model } from "@app/lib/models";

type Explanation = {
  explanation: string;
  answer: string;
  check: boolean;
};

export class EE extends Algorithm {
  readonly N_SHOT = 8;
  readonly POOL_SIZE = 32;
  readonly TEMPERATURE = 0.7;
  readonly RATING_DEPTH = 2;

  private results: TestResult[] = [];

  constructor(dataset: Dataset, model: Model) {
    super(dataset, model);
    this.results = [];
  }

  algorithm(): AlgorithmType {
    return "EE";
  }

  async initializePool({
    test,
    iteration,
    debug,
  }: {
    test: Test;
    iteration?: number;
    debug?: boolean;
  }): Promise<Explanation[]> {
    const pool: Explanation[] = [];

    for (let i = 0; i < this.POOL_SIZE; i++) {
      const examples = this.dataset.examples({
        problem: test.id,
        count: this.N_SHOT,
        iteration: iteration ? iteration * i : i,
      });

      const messages: ChatMessage[] = [];

      let prompt = `<Instructions>\n`;
      prompt += `${this.dataset.instructions()}`;
      prompt += "\n\n";
      prompt += `Provide a reasoning consisting in multiple steps, using one line per step.`;
      prompt += ` ${this.dataset.reasoningStepInstructions()}`;
      prompt += `\n</Instructions>\n`;

      for (const e of examples.slice(0, this.N_SHOT / 2)) {
        prompt += `\n\n<Example>\n`;
        prompt += `QUESTION: ${e.question}\n`;
        prompt += `REASONING:\n${e.reasoning.join("\n")}\n`;
        prompt += `ANSWER: ${e.answer}\n`;
        prompt += `</Example>`;
      }

      messages.push({
        role: "system",
        content: prompt,
      });

      messages.push({
        role: "system",
        content: prompt,
      });

      for (const e of examples.slice(this.N_SHOT / 2)) {
        messages.push({
          role: "user",
          content: `QUESTION: ${e.question}`,
        });
        messages.push({
          role: "assistant",
          content: `REASONING:\n${e.reasoning.join("\n")}\nANSWER: ${e.answer}`,
        });
      }

      messages.push({
        role: "user",
        content: `QUESTION: ${test.question}`,
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
        temperature: this.TEMPERATURE,
        maxTokens:
          this.dataset.maxTokens().reasoningStep *
          this.dataset.maxTokens().maxStepCount,
      };

      const c = await this.runCompletion(query);

      if (debug) {
        console.log("+++++++++++++++++++++++++");
        console.log(c.content);
        console.log("+++++++++++++++++++++++++");
      }

      const answer = this.dataset.parseAnswer(c.content);

      let check = false;
      try {
        check = await this.dataset.check({ test, answer });
      } catch (e) {
        // Nothing to do, check failed.
      }

      if (debug) {
        console.log("-------------------------");
        console.log(`PROBLEM: ${test.id}`);
        console.log(`ANSWER: ${answer}`);
        console.log(`CHECK: ${check}`);
        console.log("-------------------------");
      }

      await this.storeCompletion({
        test,
        completion: c,
        query,
        check,
      });
      this.stats();

      pool.push({
        answer,
        check,
        explanation: c.content,
      });
    }

    return pool;
  }

  async gradeExplanation({
    test,
    explanation,
    iteration,
  }: {
    test: Test;
    explanation: Explanation;
    iteration: number;
  }) {
    const messages: ChatMessage[] = [];

    let prompt = `<Instructions>\n`;
    prompt += `${this.dataset.instructions()}`;
    prompt += "\n\n";
    prompt += `Provide a reasoning consisting in multiple steps, using one line per step.`;
    prompt += ` ${this.dataset.reasoningStepInstructions()}`;
    prompt += `\n</Instructions>\n`;

    for (const e of examples.slice(0, this.N_SHOT / 2)) {
      prompt += `\n\n<Example>\n`;
      prompt += `QUESTION: ${e.question}\n`;
      prompt += `REASONING:\n${e.reasoning.join("\n")}\n`;
      prompt += `ANSWER: ${e.answer}\n`;
      prompt += `</Example>`;
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
    // Initialize the evolutionary pool for the test.
    const pool = await this.initializePool({ test, iteration, debug });

    // Rate each explanation in the pool twice

    console.log(pool);

    return {
      test,
      answer: "",
      check: false,
    };
  }

  computeResults(): void {
    console.log(
      `Result: algorithm=${this.algorithm()} dataset=${this.dataset.dataset} ` +
        `provider=${this.model.provider} model=${this.model.model()} ` +
        `check=${this.results.filter((x) => x.check).length} total=${
          this.results.length
        }`
    );
  }
}
