import OpenAI from "openai";
import { PythonSandbox } from "./sandbox";
import type { Tool } from "./tools/types";
import { z } from "zod";

function generateFunctionDocs(functions: Record<string, Tool>): string {
  let docs = "Available functions:\n";

  for (const [fnName, { description, input, output }] of Object.entries(
    functions
  )) {
    // Function signature with description
    const inputObject = input as z.ZodObject<any>;
    const outputObject = output as z.ZodObject<any>;

    docs += `- ${fnName}(${Object.keys(inputObject.shape).join(
      ", "
    )}): async function that ${description}\n`;

    // Input parameters
    docs += "  Parameters:\n";
    for (const [paramName, paramSchema] of Object.entries(inputObject.shape)) {
      const zodSchema = paramSchema as z.ZodType;
      docs += `  * ${paramName} (${zodSchema.description || "any"})\n`;
    }

    // Output fields
    docs += "  Returns an object with fields:\n";
    for (const [fieldName, fieldSchema] of Object.entries(outputObject.shape)) {
      const zodSchema = fieldSchema as z.ZodType;
      docs += `  * ${fieldName} (${zodSchema.description || "any"})\n`;
    }
  }

  return docs;
}

export class Agent {
  private sandbox!: PythonSandbox;
  private openai: OpenAI;
  private exposedTools: Set<string> = new Set();
  private goal: string;

  private constructor(goal: string, apiKey: string) {
    this.goal = goal;
    this.openai = new OpenAI({ apiKey });
  }

  static async create(goal: string, apiKey: string): Promise<Agent> {
    const agent = new Agent(goal, apiKey);
    agent.sandbox = await PythonSandbox.create();
    return agent;
  }

  private generateSystemPrompt(tools: Record<string, Tool>): string {
    return (
      "You are a Python code generator working towards the following goal:\n" +
      this.goal +
      "\n\n" +
      "Your response should follow this format:\n\n" +
      "1. (Optional) A brief explanation of what the code will do and why, in plain text\n" +
      "2. A Python code block that:\n" +
      "   - Contains no imports\n" +
      "   - Contains only top-level statements (no function definitions)\n" +
      "   - Can use await expressions directly (top-level await is supported)\n" +
      "   - Contains no comments\n" +
      "   - Is simple and self-contained\n\n" +
      generateFunctionDocs(tools) +
      "\n" +
      "Example response format:\n" +
      "This code will fetch and display the current weather in London.\n\n" +
      "```python\n" +
      "weather = await fetch_weather('London')\n" +
      'print(f\'Weather in {weather["city"]}: {weather["temperature"]}°C\')\n' +
      "```"
    );
  }

  async step(
    tools: Record<string, Tool>,
    input: string
  ): Promise<{ stdout: string; stderr: string }> {
    // Expose or update tools
    for (const [name, tool] of Object.entries(tools)) {
      this.sandbox.expose(name, tool);
      this.exposedTools.add(name);
    }

    const response = await this.openai.chat.completions.create({
      model: "o3-mini",
      messages: [
        {
          role: "system",
          content: this.generateSystemPrompt(tools),
        },
        {
          role: "user",
          content: input,
        },
      ],
    });

    if (!response.choices[0].message.content) {
      throw new Error("No code generated from OpenAI");
    }

    // Extract code from the response
    const content = response.choices[0].message.content;
    const codeMatch = content.match(/```python\n([\s\S]*?)```/) ||
      content.match(/```\n([\s\S]*?)```/) || [null, content];
    const code = codeMatch[1].trim();

    // Execute the code
    return await this.sandbox.runCode(code);
  }
}
