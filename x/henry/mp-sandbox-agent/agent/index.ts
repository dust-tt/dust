import OpenAI from "openai";
import { PythonSandbox } from "../sandbox";
import type { Tool } from "../tools/types";
import { generateToolDocs } from "./helpers";
import { z } from "zod";
import { type ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { defineTool } from "../tools/helpers";
import { systemPrompt } from "./prompts";

type StepResult = {
  generation: string;
  codeOutput: string;
};

export class Agent {
  private sandbox!: PythonSandbox;
  private openai: OpenAI;
  private exposedTools: Set<string> = new Set();
  private goal: string;
  private steps: Array<StepResult> = [];
  private shouldContinue = true;

  private constructor(goal: string, apiKey: string) {
    this.goal = goal;
    this.openai = new OpenAI({ apiKey });
  }

  private getFinalExecutionTool(): Tool {
    return defineTool(
      "Must be used when the execution logs contain enough information to provide a final answer to the user." +
        "After using this function, the user will ask you to write a final answer based on your execution logs. " +
        "This function must be awaited like any other function.",
      z.object({}),
      z.null(),
      async () => {
        this.shouldContinue = false;
        return { type: "success", result: null };
      }
    );
  }

  static async create(goal: string): Promise<Agent> {
    console.log("--------------------------------");
    console.log(`Creating agent with goal: ${goal}`);
    console.log("--------------------------------");
    const agent = new Agent(goal, process.env.OPENAI_API_KEY!);
    agent.sandbox = await PythonSandbox.create();
    return agent;
  }

  async step(_tools: Record<string, Tool>): Promise<string | null> {
    const tools = { ..._tools };
    if (Object.keys(tools).some((name) => name === "stop_execution")) {
      throw new Error("`stop_execution` is a reserved tool name.");
    }
    tools["stop_execution"] = this.getFinalExecutionTool();

    // Expose or update tools
    const errors: Array<{ tool: string; error: string }> = [];
    const logs: Array<string> = [];
    for (const [name, tool] of Object.entries(tools)) {
      this.sandbox.expose(name, {
        ...tool,
        fn: async (input: Tool["input"]) => {
          const result = await tool.fn(input, {
            log: (message: string) => {
              logs.push(message + "\n");
            },
          });
          if (result.type === "success") {
            return result.result;
          }
          errors.push({ tool: name, error: result.error });
          return null;
        },
      });
      this.exposedTools.add(name);
    }

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: this.goal,
      },
    ];

    for (const [i, step] of this.steps.entries()) {
      messages.push({
        role: "assistant",
        content: step.generation,
      });
      messages.push({
        role: "user",
        content:
          `Here is the output of the code you generated:\n\n` +
          `${step.codeOutput}\n\nPlease continue generating code.`,
      });
    }

    if (!this.steps.length) {
      messages[messages.length - 1].content +=
        "\nPlease begin by an analysis and a python code block to achieve the goal.\n";
    }

    messages[messages.length - 1].content +=
      `\n\nYou currently have access to the following function:` +
      `\n${generateToolDocs(tools)}`;

    console.log("--------------------------------");
    console.log("Messages:");
    console.log(messages);
    console.log("--------------------------------");

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages,
    });

    if (!response.choices[0].message.content) {
      throw new Error("No code generated from OpenAI");
    }

    // Extract code from the response
    const content = response.choices[0].message.content;
    console.log("--------------------------------");
    console.log("Code generation response:");
    console.log(content);
    console.log("--------------------------------");

    const codeMatch = content.match(/```python\n([\s\S]*?)```/) ||
      content.match(/```\n([\s\S]*?)```/) || [null, content];
    const code = codeMatch[1].trim();

    // Execute the code
    const codeOutput = await (async () => {
      try {
        const codeOutput = await this.sandbox.runCode(code);
        let output = "";
        if (codeOutput.stdout) {
          output += `STDOUT:\n${codeOutput.stdout}\n\n`;
        }
        if (logs.length > 0) {
          output += `EXECUTION LOGS:\n${logs.join("\n")}\n\n`;
        }
        if (codeOutput.stderr) {
          output += `STDERR:\n${codeOutput.stderr}\n\n`;
        }
        if (errors.length > 0) {
          output += `ERRORS:\n${errors
            .map((e) => `* ${e.tool}: ${e.error}`)
            .join("\n")}\n\n`;
        }

        if (!output) {
          return "No output returned from the code.";
        }

        return output;
      } catch (error) {
        return `STDERR:\n${error}`;
      }
    })();

    console.log("--------------------------------");
    console.log("Code output:");
    console.log(codeOutput);
    console.log("--------------------------------");

    messages.push({
      role: "assistant",
      content: content,
    });

    if (!this.shouldContinue) {
      messages.push({
        role: "user",
        content:
          "Please provide a comprehensive final answer to the goal based on the execution logs you have.",
      });
      const finalResponse = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages,
      });
      return finalResponse.choices[0].message.content;
    }

    const stepResult: StepResult = {
      generation: content,
      codeOutput: codeOutput,
    };

    console.log("--------------------------------");
    console.log("Step result:");
    console.log(stepResult);
    console.log("--------------------------------");

    this.steps.push(stepResult);

    return null;
  }

  getSteps(): Array<StepResult> {
    return this.steps;
  }
}
