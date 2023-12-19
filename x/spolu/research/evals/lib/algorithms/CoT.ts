import { Algorithm, TestResult } from "@app/lib/algorithms";
import { Dataset, Test } from "@app/lib/datasets";
import { ChatMessage, Model } from "@app/lib/models";

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

    const c = await model.completion({
      messages,
      temperature: this.TEMPERATURE,
    });

    if (!c.content.includes("REASONING:")) {
      return {
        test,
        answer: "",
        check: false,
      };
    }

    // console.log(c.content);

    const content = c.content.split("REASONING:")[1].trim();

    if (!content.includes("ANSWER:")) {
      return {
        test,
        answer: "",
        check: false,
      };
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
      console.log("----------");
      console.log(`REASONING:\n${reasoning.join("\n")}`);
      console.log(`ANSWER: ${answer}`);
      console.log(`CHECK: ${check}`);
    }

    return {
      test,
      answer,
      check,
    };
  }
}
