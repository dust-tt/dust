import seedrandom from "seedrandom";

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
  readonly POOL_SIZE = 16;
  readonly TEMPERATURE = 0.7;
  readonly GRADING_DEPTH = 2;
  readonly GENERATIONS = 3;
  readonly CROSSOVERS = 4;

  private results: TestResult[] = [];

  constructor(dataset: Dataset, model: Model) {
    super(dataset, model);
    this.results = [];
  }

  algorithm(): AlgorithmType {
    return "EE";
  }

  taskPrompt(): string {
    let prompt = "";
    prompt += `${this.dataset.instructions()}`;
    prompt += "\n\n";
    prompt += `Provide a reasoning consisting in multiple steps, using one line per step.`;
    prompt += ` ${this.dataset.reasoningStepInstructions()}`;
    return prompt;
  }

  explanativePrompt(): string {
    let prompt = "";
    prompt += `You are an expert professor in your field of expertise.`;
    prompt += ` A good explanation is minimal, deductive, correct and complete.`;
    prompt += ` It should be clearly understandable by your PhD students, ommiting obvious details`;
    prompt += ` but including all the necessary steps to reach the conclusion.`;
    prompt += ` Be precise about what you think is good or bad in the proposed explanation.`;
    prompt += ` Try to think hard about what might be incorrect in the explanation`;
    prompt += ` and always propose ways to improve it to make it clearer,`;
    prompt += ` more concise if possible, more precise if necessary, and more convincing.`;
    return prompt;
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
      prompt += this.taskPrompt();
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
    prompt += this.taskPrompt();
    prompt += `\n---\n\n`;
    prompt += this.explanativePrompt();
    prompt += `\n\n`;
    if (explanation.gradings.length === 0) {
      prompt += `Your goal is to produce a commentary of the explanation that was`;
    } else {
      prompt += `Your goal is to criticize the commentaries made by other experts on the explanation`;
    }
    prompt += ` proposed in response to the following question:\n\n`;
    prompt += `QUESTION: ${test.question}`;
    prompt += `\n</Instructions>\n`;

    messages.push({
      role: "system",
      content: prompt,
    });

    let content = `The explanation to comment/criticize:\n\n${explanation.explanation}`;

    if (explanation.gradings.length > 0) {
      content += `\n\n`;
      content += `The commentaries made by other experts to comment/criticize:`;
      for (let i = 0; i < explanation.gradings.length; i++) {
        content += `\n\nEXPERT ${i}:\n\n${explanation.gradings[i]}`;
      }
    }

    messages.push({
      role: "user",
      content,
    });

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

    // console.log(">>>>>>>>>>>>>>>>>>>>>>>>>");
    // console.log("COMMENTARY");
    // console.log(">>>>>>>>>>>>>>>>>>>>>>>>>");
    // console.log(c.content);
    // console.log("<<<<<<<<<<<<<<<<<<<<<<<<<");

    await this.storeCompletion({
      test,
      completion: c,
      query,
      check: false,
    });
    this.stats();

    explanation.gradings.push(c.content);
  }

  async crossOver({
    test,
    pool,
    generation,
    iteration,
  }: {
    test: Test;
    pool: Explanation[];
    generation: number;
    iteration: number;
  }): Promise<Explanation> {
    const rng = seedrandom(
      `EE-CROSSOVER-${test.id}-${generation}-${iteration}`
    );

    // pick this.CROSSOVERS explanations at random using rng
    const explanations: Explanation[] = [];
    const indexes: number[] = [];
    for (let i = 0; i < this.CROSSOVERS; i++) {
      let index = Math.floor(rng() * pool.length);
      while (indexes.includes(index)) {
        index = Math.floor(rng() * pool.length);
      }
      explanations.push(pool[index]);
    }

    const messages: ChatMessage[] = [];

    let prompt = `<Instructions>\n`;
    prompt += this.taskPrompt();
    prompt += `\n---\n\n`;
    prompt += this.explanativePrompt();
    prompt += `\n\n`;
    prompt += `Based on the following ${this.CROSSOVERS} explanations from field experts`;
    prompt += ` along with commentaries made by other experts on each of them,`;
    prompt += ` your goal is to propose the best possible explanation to answer the following question:\n\n`;
    prompt += `QUESTION: ${test.question}`;
    prompt += `\n</Instructions>\n`;

    messages.push({
      role: "system",
      content: prompt,
    });

    let content = `The explanations and commentaries:`;

    for (let i = 0; i < explanations.length; i++) {
      content += `\n\nEXPLANATION ${i}:\n\n${explanations[i].explanation}`;
      for (let j = 0; j < explanations[i].gradings.length; j++) {
        content += `\n\nEXPERT COMMENTARY ${i} ${j}:\n\n${explanations[i].gradings[j]}`;
      }
    }

    content += `\n\n`;
    content +=
      "Propose the best possible explanation and answer start with `REASONING:` and and with `ANSWER:`.";

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
      temperature: this.TEMPERATURE,
      maxTokens:
        this.dataset.maxTokens().reasoningStep *
        this.dataset.maxTokens().maxStepCount,
    };

    const c = await this.runCompletion(query);

    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>");
    console.log(
      `CROSSOVER test=${test.id} generation=${generation} iteration=${iteration}`
    );
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>");
    console.log(c.content);
    console.log("<<<<<<<<<<<<<<<<<<<<<<<<<");

    const answer = this.dataset.parseAnswer(c.content);

    let check = false;
    try {
      check = await this.dataset.check({ test, answer });
    } catch (e) {
      // Nothing to do, check failed.
    }

    // console.log("-------------------------");
    // console.log(`PROBLEM: ${test.id}`);
    // console.log(`ANSWER: ${answer}`);
    // console.log(`CHECK: ${check}`);
    // console.log("-------------------------");

    await this.storeCompletion({
      test,
      completion: c,
      query,
      check,
    });
    this.stats();

    return {
      answer,
      check,
      explanation: c.content,
      gradings: [],
    };
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
    let pool = await this.initializePool({ test, iteration, debug });

    // console.log(pool);

    for (let generation = 0; generation < this.GENERATIONS; generation++) {
      // Compute the good and bad answers
      const good = pool.filter((x) => x.check).length;
      console.log(
        `Iteration: test=${test.id} generation=${generation} good=${good}/${pool.length}`
      );

      // Rate each explanation in the pool twice
      for (let i = 0; i < this.GRADING_DEPTH; i++) {
        for (const explanation of pool) {
          await this.gradeExplanation({ test, explanation });
        }
      }

      // Now is time to cross-over explanations
      const newPool: Explanation[] = [];
      for (let iteration = 0; iteration < this.POOL_SIZE; iteration++) {
        const c = await this.crossOver({ test, pool, generation, iteration });
        newPool.push(c);
      }

      pool = newPool;
    }

    // Compute the good and bad answers
    const good = pool.filter((x) => x.check).length;
    console.log(
      `Iteration: test=${test.id} generation=${this.GENERATIONS} good=${good}/${pool.length}`
    );

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
