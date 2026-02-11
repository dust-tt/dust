import type { ToolCall, ToolDefinition } from "../agent/types.js";

import { readFileTool } from "./readFile.js";
import { writeFileTool } from "./writeFile.js";
import { editFileTool } from "./editFile.js";
import { bashTool } from "./bash.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { askUserTool } from "./askUser.js";
import { callDustAgentTool } from "./callDustAgent.js";
import { taskTool } from "./task.js";
import type { DustAPI } from "@dust-tt/client";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<string>;
}

export interface ToolContext {
  cwd: string;
  dustClient: DustAPI | null;
  askUser: (question: string) => Promise<string>;
  approveToolCall: (call: ToolCall) => Promise<boolean>;
  onSubAgentEvent?: (taskId: string, event: unknown) => void;
}

const AUTO_APPROVED_TOOLS = new Set(["read_file", "glob", "grep", "ask_user"]);

/**
 * Create all tools with the given context.
 */
export function createTools(context: ToolContext): Tool[] {
  const tools: Tool[] = [
    readFileTool(context),
    writeFileTool(context),
    editFileTool(context),
    bashTool(context),
    globTool(context),
    grepTool(context),
    askUserTool(context),
  ];

  if (context.dustClient) {
    tools.push(callDustAgentTool(context));
    tools.push(taskTool(context));
  }

  return tools;
}

/**
 * Get tool definitions for the LLM.
 */
export function getToolDefinitions(tools: Tool[]): ToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/**
 * Execute a tool call, gating on user approval for non-auto-approved tools.
 */
export async function executeTool(
  tools: Tool[],
  call: ToolCall,
  approveToolCall: (call: ToolCall) => Promise<boolean>
): Promise<string> {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    return `Error: Unknown tool "${call.name}"`;
  }

  if (!AUTO_APPROVED_TOOLS.has(call.name)) {
    const approved = await approveToolCall(call);
    if (!approved) {
      return "Tool execution rejected by user.";
    }
  }

  try {
    return await tool.execute(call.input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error executing ${call.name}: ${message}`;
  }
}
