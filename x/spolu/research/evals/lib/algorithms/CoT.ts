import { Algorithm, TestResult } from "@app/lib/algorithms";
import { Dataset, Test } from "@app/lib/datasets";
import { ChatCompletion, ChatMessage, Model } from "@app/lib/models";

export class CoT extends Algorithm {
  readonly algorithm = "CoT";

  readonly N_SHOT = 8;
  readonly TEMPERATURE = 0.7;

  constructor() {
    super();
  }

  async runOne({
    model,
    dataset,
    test,
    debug,
  }: {
    model: Model;
    dataset: Dataset;
    test: Test;
    debug?: boolean;
  }): Promise<TestResult> {
    const examples = dataset.examples({
      problem: test.id,
      count: this.N_SHOT,
      iteration: 0,
    });

    // console.log(`Running test: id=${test.id} examples=${examples.length}`);

    const messages: ChatMessage[] = [];

    let prompt = `INSTRUCTIONS:\n`;
    prompt += ` ${dataset.instructions()}`;
    prompt += "\n\n";
    prompt += `Start by providing a REASONING consisting in multiple steps, using one line per step.`;
    prompt += ` ${dataset.reasoningStepInstructions()}`;
    prompt += ` Finally provide a final ANSWER.`;
    prompt += ` ${dataset.answerInstructions()}`;
    // prompt +=
    //   ` Do not perform multiple reasoning attempts per question,` +
    //   ` do not backtrack in your reasoning steps.`;
    prompt += "\n\n";
    prompt += `EXAMPLES:\n`;

    for (const e of examples.slice(0, 4)) {
      prompt += `\nQUESTION: ${e.question}\n`;
      prompt += `REASONING:\n${e.reasoning.join("\n")}\n`;
      prompt += `ANSWER: ${e.answer}\n`;
    }

    messages.push({
      role: "system",
      content: prompt,
    });

    for (const e of examples.slice(4)) {
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
    // console.log(messages);

    let maxTokens: number | undefined = undefined;
    const datasetMaxTokens = dataset.maxTokens();
    if (datasetMaxTokens.reasoning && datasetMaxTokens.answer) {
      maxTokens = datasetMaxTokens.reasoning + datasetMaxTokens.answer;
    }

    const c = await model.completionWithRetry({
      messages,
      temperature: this.TEMPERATURE,
      maxTokens,
    });

    const finish = (
      test: Test,
      completion: ChatCompletion,
      check: boolean,
      answer: string
    ) => {
      this.storeCompletion({
        test,
        check,
        completion,
      });
      this.stats();
      return {
        test,
        answer,
        check,
      };
    };

    if (debug) {
      console.log("+++++++++++++++++++++++++");
      console.log(c.content);
      console.log("+++++++++++++++++++++++++");
    }

    if (!c.content || !c.content.includes("REASONING:")) {
      return finish(test, c, false, "");
    }

    const content = c.content.split("REASONING:")[1].trim();

    if (!content.includes("ANSWER:")) {
      return finish(test, c, false, "");
    }

    const reasoning = content.split("ANSWER:")[0].trim().split("\n");
    const answer = content.split("ANSWER:")[1].trim();

    let check = false;
    try {
      check = await dataset.check({ test, answer });
    } catch (e) {
      // Nothing to do, check failed.
    }

    if (debug) {
      console.log(`REASONING: ${reasoning.join(" ")}`);
      console.log(`ANSWER: ${answer}`);
      console.log(`CHECK: ${check}`);
      console.log("-------------------------");
    }

    return finish(test, c, check, answer);
  }
}
