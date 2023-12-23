import { Algorithm, AlgorithmType, TestResult } from "@app/lib/algorithms";
import { Dataset, Test } from "@app/lib/datasets";
import { ChatCompletion, ChatMessage, ChatQuery, Model } from "@app/lib/models";

export class CoT extends Algorithm {
  readonly N_SHOT = 8;
  readonly TEMPERATURE = 0.7;

  private results: TestResult[];

  constructor(dataset: Dataset, model: Model) {
    super(dataset, model);
    this.results = [];
  }

  algorithm(): AlgorithmType {
    return "CoT";
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
    const examples = this.dataset.examples({
      problem: test.id,
      count: this.N_SHOT,
      iteration: iteration || 0,
    });

    // console.log(`Running test: id=${test.id} examples=${examples.length}`);

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

    const finish = async (
      test: Test,
      completion: ChatCompletion,
      query: ChatQuery,
      check: boolean,
      answer: string
    ) => {
      await this.storeCompletion({
        test,
        completion,
        query,
        check,
      });
      this.stats();

      const result: TestResult = {
        test,
        answer,
        check,
      };
      this.results.push(result);
      return result;
    };

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

    return await finish(test, c, query, check, answer);
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
