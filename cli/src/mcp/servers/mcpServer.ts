import type {
  GetAgentConfigurationsResponseType,
  DustAPI,
} from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDustClient } from "../../utils/dustClient.js";
import { normalizeError } from "../../utils/errors.js";
import { ExternalMcpService } from "../types/externalMcpService.js";

// Define AgentConfiguration type locally or import if shared
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

export class AgentsMcpService extends ExternalMcpService {
  private selectedAgents: AgentConfiguration[] = [];
  private dustClient: any = null;
  private user: any = null;

  constructor(selectedAgents: AgentConfiguration[], requestedPort?: number) {
    super(requestedPort);
    this.selectedAgents = selectedAgents;
  }

  async initializeDustClient(): Promise<void> {
    if (!this.dustClient) {
      this.dustClient = await getDustClient();
      if (!this.dustClient) {
        throw new Error(
          "Dust client not initialized. Please run 'dust login'."
        );
      }

      const meRes = await this.dustClient.me();
      if (meRes.isErr()) {
        throw new Error(
          `Failed to get user information: ${meRes.error.message}`
        );
      }
      this.user = meRes.value;
    }
  }

  async createMcpServer(): Promise<McpServer> {
    await this.initializeDustClient();

    const server = new McpServer({
      name: "dust-cli-agents-mcp-server",
      version: process.env.npm_package_version || "0.1.0",
    });

    for (const agent of this.selectedAgents) {
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
          const convRes = await this.dustClient.createConversation({
            title: `MCP CLI (${toolName}) - ${new Date().toISOString()}`,
            visibility: "unlisted",
            message: {
              content: userInput,
              mentions: [{ configurationId: agent.sId }],
              context: {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                username: this.user.username,
                fullName: this.user.fullName,
                email: this.user.email,
                profilePictureUrl: this.user.image,
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
          const streamRes = await this.dustClient.streamAgentAnswerEvents({
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

    return server;
  }
}

// Legacy function for backward compatibility
export async function startMcpServer(
  selectedAgents: AgentConfiguration[],
  onServerStart: (url: string) => void,
  requestedPort?: number
) {
  const service = new AgentsMcpService(selectedAgents, requestedPort);
  const url = await service.startServer(onServerStart);
  return url;
}
