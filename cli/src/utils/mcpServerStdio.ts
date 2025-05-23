import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getDustClient } from "./dustClient.js";
import { normalizeError } from "./errors.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

// Helper function to slugify agent names for tool names
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "_")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export async function startMcpServerStdio(requestedSIds: string[]) {
  const dustClient = await getDustClient();
  if (!dustClient) {
    throw new Error("Dust client not initialized. Please run 'dust login'.");
  }

  const meRes = await dustClient.me();
  if (meRes.isErr()) {
    throw new Error(`Failed to get user information: ${meRes.error.message}`);
  }

  const user = meRes.value;

  // Fetch agent configurations
  const agentsRes = await dustClient.getAgentConfigurations({
    view: "all",
  });
  if (agentsRes.isErr()) {
    throw new Error(`Failed to get agent configurations: ${agentsRes.error.message}`);
  }

  // Filter agents by requested sIds
  const selectedAgents = agentsRes.value.filter(
    (agent: AgentConfiguration) => requestedSIds.includes(agent.sId)
  );

  if (selectedAgents.length === 0) {
    throw new Error(`No agents found with sIds: ${requestedSIds.join(", ")}`);
  }

  // Verify all requested agents were found
  const foundSIds = selectedAgents.map((a: AgentConfiguration) => a.sId);
  const notFoundSIds = requestedSIds.filter((sId) => !foundSIds.includes(sId));
  if (notFoundSIds.length > 0) {
    console.error(`Warning: The following agent sIds were not found: ${notFoundSIds.join(", ")}`);
  }

  console.error(`Starting MCP server with ${selectedAgents.length} agent(s) via stdio transport...`);
  selectedAgents.forEach((agent: AgentConfiguration) => {
    console.error(`  - ${agent.name} (${agent.sId})`);
  });

  // Create the MCP server
  const server = new McpServer({
    name: "dust-cli-mcp-server",
    version: process.env.npm_package_version || "0.1.0",
  });

  // Register tools for each agent
  for (const agent of selectedAgents) {
    const toolName = `run_agent_${slugify(agent.name)}`;
    let toolDescription = `This tool allows to call a Dust AI agent name ${agent.name}.`;
    if (agent.description) {
      toolDescription += `\nThe agent is described as follows: ${agent.description}`;
    }

    server.tool(
      toolName,
      toolDescription,
      { userInput: z.string().describe("The user input to the agent.") },
      async ({ userInput }: { userInput: string }) => {
        const convRes = await dustClient.createConversation({
          title: `MCP CLI (${toolName}) - ${new Date().toISOString()}`,
          visibility: "unlisted",
          message: {
            content: userInput,
            mentions: [{ configurationId: agent.sId }],
            context: {
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              username: user.username,
              fullName: user.fullName,
              email: user.email,
              profilePictureUrl: user.image,
              origin: "api",
            },
          },
          contentFragment: undefined,
        });

        if (convRes.isErr()) {
          const errorMessage = `Failed to create conversation: ${convRes.error.message}`;
          console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
          };
        }

        const { conversation, message: createdUserMessage } = convRes.value;
        if (!createdUserMessage) {
          const errorMessage = `Failed to create user message`;
          console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
          };
        }
        const streamRes = await dustClient.streamAgentAnswerEvents({
          conversation: conversation,
          userMessageId: createdUserMessage.sId,
        });

        if (streamRes.isErr()) {
          const errorMessage = `Failed to stream agent answer: ${streamRes.error.message}`;
          console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
          };
        }

        let finalContent = "";
        try {
          for await (const event of streamRes.value.eventStream) {
            if (event.type === "generation_tokens") {
              finalContent += event.text;
            } else if (event.type === "agent_error") {
              const errorMessage = `Agent error: ${event.error.message}`;
              console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
              return {
                content: [{ type: "text", text: errorMessage }],
                isError: true,
              };
            } else if (event.type === "user_message_error") {
              const errorMessage = `User message error: ${event.error.message}`;
              console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
              return {
                content: [{ type: "text", text: errorMessage }],
                isError: true,
              };
            } else if (event.type === "agent_message_success") {
              break;
            }
          }
        } catch (streamError) {
          const errorMessage = `Error processing agent stream: ${
            normalizeError(streamError).message
          }`;
          console.error(`[MCP Tool Error ${toolName}] ${errorMessage}`);
          return {
            content: [{ type: "text", text: errorMessage }],
            isError: true,
          };
        }

        console.error(`[MCP Tool Success ${toolName}] Execution finished.`);
        return { content: [{ type: "text", text: finalContent.trim() }] };
      }
    );
  }

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const shutdown = async () => {
    console.error("\nShutting down MCP server...");
    try {
      await server.close();
      console.error("MCP server closed.");
    } catch (error) {
      console.error("Error closing MCP server:", error);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Connect server to transport
  try {
    await server.connect(transport);
    console.error("MCP server connected via stdio transport.");
    console.error("Ready to receive requests. Press Ctrl+C to stop.");
  } catch (error) {
    console.error("Failed to connect MCP server:", error);
    process.exit(1);
  }
}