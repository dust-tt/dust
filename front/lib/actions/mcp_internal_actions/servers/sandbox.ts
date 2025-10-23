import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { DaytonaSandboxProvider } from "@app/lib/actions/mcp_internal_actions/servers/sandbox/daytona_provider";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { Err, normalizeError, Ok } from "@app/types";

const INSTRUCTIONS = `
## Sandbox Tool

You have access to a sandboxed environment that allows you to execute code snippets and return the output.
Each conversation gets its own persistent sandbox.

If another tool already exists to perform a task, use it instead of the sandbox. This is your decision framework for using this tool:
    1. Does this require computation I cannot reliably do mentally?
    2. Would showing code + output be more trustworthy than just stating an answer?
    3. Is the data complex enough to benefit from Pandas/NumPy? (multiple columns, transformations, aggregations)

    If the answer is yes to any of these questions, use the sandbox.

- When to use the sandbox:
    - Mathematical calculations and simulations
    - Data analysis or transformations with Pandas, NumPy
    - Algorithms
    - Formula evaluation

- Do NOT use the sandbox for:
    - API calls
    - Simple calculations and simulations
    - Questions answerable from search or your knowledge
    - Interactive visualizations and charts

The sandbox has no public internet access.

The sandbox includes common packages, including but not limited to: beautifulsoup4, numpy, llama-index, opencv-python, pandas, scikit-learn, scipy

The output of the execution is the standard output of the code. It will be helpful to print or log the output in the code snippet so it can be returned to the user.
`;

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("sandbox", {
    augmentedInstructions: INSTRUCTIONS,
  });

  server.tool(
    "execute_code",
    "Execute code in a sandboxed environment. Use this to run code snippets and return the output.",
    {
      language: z
        .enum(["python", "javascript", "typescript"])
        .describe("The programming language of the code to execute"),
      code: z.string().describe("The code to execute"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "execute_code",
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ language, code }) => {
        const daytonaAPIKey = config.getDaytonaAPIKey();

        if (!agentLoopContext?.runContext) {
          return new Err(
            new MCPError("No conversation context available", {
              tracked: false,
            })
          );
        }
        const { conversation } = agentLoopContext.runContext;

        const provider = new DaytonaSandboxProvider(daytonaAPIKey);
        const sandboxName = `${conversation.sId}-${language}`;

        try {
          // Sandbox lifecycle management is not expected to be handle inside the MCP tool.
          const sandbox = await provider.getOrCreateSandbox(
            sandboxName,
            language
          );
          const result = await sandbox.executeCode(code);

          const outputText = result.error
            ? `Exit code: ${result.exitCode}\n\nError:\n${result.error}\n\nOutput:\n${result.result}`
            : `Exit code: ${result.exitCode}\n\nOutput:\n${result.result}`;

          return new Ok([
            {
              type: "text" as const,
              text: outputText,
            },
          ]);
        } catch (error) {
          return new Err(
            new MCPError(
              `Failed to execute code: ${normalizeError(error).message}`,
              {
                tracked: true,
              }
            )
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
