import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Registers the set_agent_instructions tool on the MCP server.
 * This tool allows the copilot to update the agent's instructions in the form.
 */
export function registerSetAgentInstructionsTool(
  mcpServer: McpServer,
  setInstructions: (instructions: string) => void
): void {
  mcpServer.tool(
    "set_agent_instructions",
    "Replace the agent's instructions with new content. Use this to update the agent's instructions based on user requests.",
    {
      instructions: z
        .string()
        .describe("The new instructions to set for the agent"),
    },
    ({ instructions }) => {
      setInstructions(instructions);

      return {
        content: [
          {
            type: "text" as const,
            text: "Instructions updated successfully.",
          },
        ],
      };
    }
  );
}
