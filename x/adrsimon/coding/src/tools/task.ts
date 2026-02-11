import type { DustAPI } from "@dust-tt/client";

import { createAgentLoop } from "../agent/loop.js";
import { buildSystemPrompt } from "../agent/systemPrompt.js";
import type { Tool, ToolContext } from "./index.js";
import { createTools, getToolDefinitions, executeTool as executeToolCall } from "./index.js";

export function taskTool(context: ToolContext): Tool {
  return {
    name: "task",
    description:
      "Launch a sub-agent to handle a task. The sub-agent runs with its own conversation " +
      "and can use tools independently. Use this for parallel work or isolated tasks. " +
      'Two modes: "local" spawns a local coding sub-agent, "dust_agent" delegates to a Dust workspace agent.',
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["local", "dust_agent"],
          description: '"local" for a coding sub-agent, "dust_agent" to call a Dust workspace agent.',
        },
        prompt: {
          type: "string",
          description: "The task description or prompt for the sub-agent.",
        },
        agent: {
          type: "string",
          description: 'For dust_agent type: the agent name (e.g. "@security-auditor").',
        },
        tools: {
          type: "array",
          items: { type: "string" },
          description:
            "For local type: subset of tool names to enable. Default: all tools except task.",
        },
      },
      required: ["type", "prompt"],
    },
    async execute(input) {
      const taskType = input.type as string;
      const prompt = input.prompt as string;

      if (taskType === "dust_agent") {
        const agentName = input.agent as string;
        if (!agentName) {
          return 'Error: "agent" is required for dust_agent type.';
        }
        if (!context.dustClient) {
          return "Error: Dust client not available.";
        }

        // Delegate to callDustAgent via direct import.
        const { callDustAgentTool } = await import("./callDustAgent.js");
        const tool = callDustAgentTool(context);
        return tool.execute({ agent: agentName, message: prompt });
      }

      if (taskType === "local") {
        return runLocalSubAgent(context, prompt, input.tools as string[] | undefined);
      }

      return `Error: Unknown task type "${taskType}". Use "local" or "dust_agent".`;
    },
  };
}

async function runLocalSubAgent(
  context: ToolContext,
  prompt: string,
  toolSubset?: string[]
): Promise<string> {
  const dustClient = context.dustClient;
  if (!dustClient) {
    return "Error: Dust client not available for sub-agent.";
  }

  // Create tools for the sub-agent (no task tool to prevent recursion).
  const allTools = createTools({
    ...context,
    askUser: async () => "(sub-agent cannot ask user questions directly)",
  });

  let enabledTools = allTools.filter((t) => t.name !== "task");

  if (toolSubset && toolSubset.length > 0) {
    const subsetSet = new Set(toolSubset);
    enabledTools = enabledTools.filter((t) => subsetSet.has(t.name));
  }

  const toolDefs = getToolDefinitions(enabledTools);
  const systemPrompt = buildSystemPrompt(context.cwd) +
    "\n\nYou are a sub-agent handling a specific task. Complete the task and return a clear summary of what you did.";

  const loop = createAgentLoop({
    dustClient,
    systemPrompt,
    tools: toolDefs,
    executeTool: (call) => executeToolCall(enabledTools, call, context.approveToolCall),
    maxTokens: 8192,
  });

  // Collect all text output from the sub-agent.
  let responseText = "";
  let isDone = false;

  // Start the agent with the task prompt.
  loop.sendMessage(prompt);

  for await (const event of loop.events()) {
    switch (event.type) {
      case "text_delta":
        responseText += event.text;
        break;
      case "done":
        isDone = true;
        break;
      case "error":
        return `Sub-agent error: ${event.message}`;
    }

    if (isDone) {
      break;
    }
  }

  return responseText || "(sub-agent returned no output)";
}
