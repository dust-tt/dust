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

You have access to a sandboxed Python environment that allows you to execute code snippets and return the output.
Each conversation gets its own persistent sandbox with pre-installed data science packages.

### DECISION FRAMEWORK: When to Use the Sandbox

Ask yourself these questions:
1. **Computation**: Does this require computation I cannot reliably do mentally?
2. **Trustworthiness**: Would showing code + output be more trustworthy than just stating an answer?
3. **Data Complexity**: Is the data complex enough to benefit from Python libraries?

**If YES to any of these questions, use the sandbox.**

### WHEN TO USE THE SANDBOX

**Mathematical & Scientific Computing:**
- Complex calculations, simulations, statistical analysis
- Numerical optimization, linear algebra, matrix operations

**Data Analysis & Processing:**
- Data transformations with Pandas (grouping, pivoting, merging)
- Data cleaning, exploratory analysis, time series analysis

**Algorithm Implementation:**
- Custom algorithms, performance benchmarking, formula evaluation

### WHEN NOT TO USE THE SANDBOX

**Avoid for:**
- API calls or network requests (no internet access)
- Simple arithmetic that can be done mentally
- Questions answerable from search or your knowledge
- Interactive visualizations (use visualization tools instead)
- File I/O operations (limited file system access)

### TECHNICAL SPECIFICATIONS

**Environment:** Python 3.x with persistent state, no internet access, isolated per conversation

**Available Packages:**
- **Data Science**: pandas, numpy, scipy
- **Machine Learning**: scikit-learn, scikit-image
- **Web Scraping**: beautifulsoup4, requests
- **AI/ML**: llama-index
- **Computer Vision**: opencv-python

**Output:** Standard output captured, errors included, exit codes indicate success/failure

### BEST PRACTICES

- Write clear, well-commented code with meaningful variable names
- Use vectorized operations (NumPy/Pandas) instead of loops
- Print intermediate results to show your work
- Format numerical output appropriately
- Handle potential errors gracefully

### EXAMPLE USAGE

**Data Analysis:**
\`\`\`python
import pandas as pd
import numpy as np

df = pd.DataFrame({'A': [1, 2, 3], 'B': [4, 5, 6]})
print("Data shape:", df.shape)
print("Summary statistics:")
print(df.describe())
\`\`\`

**Mathematical Computation:**
\`\`\`python
import numpy as np
from scipy import optimize

def f(x):
    return x**2 - 4

result = optimize.root_scalar(f, bracket=[0, 5])
print(f"Root found at x = {result.root}")
\`\`\`
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
        .enum(["python"])
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
        const workspaceId = auth.getNonNullableWorkspace().sId;

        const provider = new DaytonaSandboxProvider(daytonaAPIKey);
        const sandboxName = `${workspaceId}-${conversation.sId}-${language}`;

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
