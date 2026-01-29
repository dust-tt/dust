import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type {
  AddSuggestionResult,
  CopilotInstructionsSuggestion,
} from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";

export interface SuggestInstructionChangesCallbacks {
  addSuggestion: (
    suggestion: Omit<CopilotInstructionsSuggestion, "id" | "matchPositions">,
    expectedCount?: number
  ) => AddSuggestionResult;
}

/**
 * Registers the suggest_instruction_changes tool on the MCP server.
 * This tool allows the copilot to suggest changes to the agent's instructions
 * that the user can accept or reject.
 */
export function registerSuggestInstructionChangesTool(
  mcpServer: McpServer,
  callbacks: SuggestInstructionChangesCallbacks
): void {
  mcpServer.tool(
    "suggest_instruction_changes",
    `Suggest a change to the agent's instructions. The change will be shown to the user as a diff that they can accept or reject.

Use this tool to propose modifications to specific parts of the instructions. The user will see the suggested change highlighted in the editor with the old text (deletion) shown in red with strikethrough and the new text (addition) shown in blue.

How it works:
- The "find" text must exactly match text that exists in the current instructions
- The suggestion will be applied to all matches found
- The user must accept the suggestion before it becomes part of the committed instructions
- Use get_agent_config to see the current instructions before suggesting changes`,
    {
      find: z
        .string()
        .describe(
          "The exact text to find and replace in the instructions. Must match exactly."
        ),
      replacement: z
        .string()
        .describe("The new text to replace the found text with."),
      expectedCount: z
        .number()
        .optional()
        .describe(
          "Optional: The expected number of matches. If provided and the actual count differs, the tool will return an error."
        ),
    },
    ({ find, replacement, expectedCount }) => {
      const result = callbacks.addSuggestion(
        {
          type: "instructions",
          find,
          replacement,
        },
        expectedCount
      );

      if (!result.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to suggest change: ${result.error}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Suggestion created successfully. Found ${result.matchCount} match(es) for the specified text. The suggestion is now visible to the user in the editor.`,
          },
        ],
      };
    }
  );
}
