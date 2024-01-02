import { Algorithm, AlgorithmType, TestResult } from "@app/lib/algorithms";
import { Dataset, Test } from "@app/lib/datasets";
import { ChatMessage, ChatQuery, Model } from "@app/lib/models";

type Explanation = {
  explanation: string;
  answer: string;
  check: boolean;
  gradings: string[];
};

export class EE extends Algorithm {
  readonly N_SHOT = 8;
  readonly POOL_SIZE = 32;
  readonly TEMPERATURE = 0.7;
  readonly GRADING_DEPTH = 3;

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
        gradings: [],
      });
    }

    return pool;
  }

  async gradeExplanation({
    test,
    explanation,
  }: {
    test: Test;
    explanation: Explanation;
  }) {
    const messages: ChatMessage[] = [];

    let prompt = `<Instructions>\n`;
    prompt += `The task we are interested in is the following:\n`;
    prompt += `\n---\n`;
    prompt += `${this.dataset.instructions()}`;
    prompt += "\n\n";
    prompt += `Provide a reasoning consisting in multiple steps, using one line per step.`;
    prompt += ` ${this.dataset.reasoningStepInstructions()}`;
    prompt += `\n---\n\n`;
    prompt += `You are an expert professor in your field of expertise.`;
    prompt += ` A good explanation is minimal, deductive, correct and complete.`;
    prompt += ` It should be clearly understandable by your PhD students, ommiting obvious details`;
    prompt += ` but including all the necessary steps to reach the conclusion.`;
    prompt += ` Be precise about what you think is good or bad in the proposed explanation.`;
    prompt += ` Try to think hard about what might be incorrect in the explanation`;
    prompt += ` and always propose ways to improve it to make it clearer and more convincing.`;
    prompt += `\n\n`;
    if (explanation.gradings.length === 0) {
      prompt += `Your goal is to grade an explanation that was generated in response to the following question:\n\n`;
    } else {
      prompt += `Your goal is to criticize the gradings made by other experts on the following explanation:\n\n`;
    }
    prompt += `QUESTION: ${test.question}`;
    prompt += `\n</Instructions>\n`;

    messages.push({
      role: "system",
      content: prompt,
    });

    messages.push({
      role: "user",
      content: `The explanation to grade:\n\n${explanation.explanation}`,
    });

    if (explanation.gradings.length > 0) {
      let content = `The gradings to criticize made by other experts:`;
      for (let i = 0; i < explanation.gradings.length; i++) {
        content += `\n\nEXPERT ${i}:\n${explanation.gradings[i]}`;
      }
      messages.push({
        role: "user",
        content,
      });
    }

    // console.log(prompt);
    messages.forEach((m) => {
      console.log(`+++++++++++++++++++++++++++++++`);
      console.log(`[${m.role}]`);
      console.log(`-------------------------------`);
      console.log(`${m.content}`);
    });

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

    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>");
    console.log(c.content);
    console.log("<<<<<<<<<<<<<<<<<<<<<<<<<");

    await this.storeCompletion({
      test,
      completion: c,
      query,
      check: false,
    });
    this.stats();

    explanation.gradings.push(c.content);
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

    console.log(pool);

    // Rate each explanation in the pool twice
    for (let i = 0; i < this.GRADING_DEPTH; i++) {
      for (const explanation of pool) {
        await this.gradeExplanation({ test, explanation });
      }
    }

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
