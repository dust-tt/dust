import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import {
  AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type {
  ActionGeneratedFileType,
  AgentLoopContextType,
} from "@app/lib/actions/types";
import {
  isMCPActionArray,
  isServerSideMCPServerConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import { getCitationsFromActions } from "@app/lib/api/assistant/citations";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { CitationType, Result } from "@app/types";
import { isGlobalAgentId } from "@app/types";
import { Err, getHeaderFromUserEmail, normalizeError, Ok } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "run_agent",
  version: "1.0.0",
  description: "Run a child agent (agent as tool).",
  icon: "ActionRobotIcon",
  authorization: null,
  documentationUrl: null,
};

function parseAgentConfigurationUri(uri: string): Result<string, Error> {
  const match = uri.match(AGENT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(new Error(`Invalid URI for an agent configuration: ${uri}`));
  }
  // Safe to do this because the inputs are already checked against the zod schema here.
  return new Ok(match[2]);
}

/**
 * This method fetches the name and description of a child agent. It returns it even if the
 * agent is private as it is referenced from a parent agent which requires a name and description
 * for the associated run_agent tool rendering.
 *
 * Actual permissions to run the agent for the auth are checked at run time when creating the
 * conversation. Through execution of the parent agent the child agent name and description could be
 * leaked to the user which appears as acceptable given the proactive decision of a builder having
 * access to it to refer it from the parent agent more broadly shared.
 *
 * If the agent has been archived, this method will return null leading to the tool being displayed
 * to the model as not configured.
 */
async function leakyGetAgentNameAndDescriptionForChildAgent(
  auth: Authenticator,
  agentId: string
): Promise<{
  name: string;
  description: string;
} | null> {
  if (isGlobalAgentId(agentId)) {
    const metadata = getGlobalAgentMetadata(agentId);

    if (!metadata) {
      return null;
    }

    return {
      name: metadata.name,
      description: metadata.description,
    };
  }

  const owner = auth.getNonNullableWorkspace();

  const agentConfiguration = await AgentConfiguration.findOne({
    where: {
      sId: agentId,
      workspaceId: owner.id,
      status: "active",
    },
    attributes: ["name", "description"],
  });

  if (!agentConfiguration) {
    return null;
  }

  return {
    name: agentConfiguration.name,
    description: agentConfiguration.description,
  };
}

async function runSingleAgent({
  api,
  mainAgent,
  mainConversation,
  childAgentBlob,
  childAgentId,
  query,
  agentLoopContext,
  sendNotification,
  _meta,
  auth,
  queryIndex,
}: {
  api: DustAPI;
  mainAgent: any;
  mainConversation: any;
  childAgentBlob: { name: string; description: string };
  childAgentId: string;
  query: string;
  agentLoopContext: AgentLoopContextType;
  sendNotification: any;
  _meta: any;
  auth: Authenticator;
  queryIndex?: number;
}): Promise<
  Result<
    {
      conversationId: string;
      text: string;
      chainOfThought?: string;
      uri: string;
      refs?: Record<string, CitationType>;
      files?: ActionGeneratedFileType[];
    },
    Error
  >
> {
  const convRes = await api.createConversation({
    title: `run_agent ${mainAgent.name} > ${childAgentBlob.name}${queryIndex !== undefined ? ` (${queryIndex + 1})` : ""}`,
    visibility: "unlisted",
    depth: mainConversation.depth + 1,
    message: {
      content: query,
      mentions: [{ configurationId: childAgentId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        username: mainAgent.name,
        fullName: `@${mainAgent.name}`,
        email: null,
        profilePictureUrl: mainAgent.pictureUrl,
        origin: "run_agent",
      },
    },
    skipToolsValidation:
      agentLoopContext.runContext?.agentMessage.skipToolsValidation ?? false,
  });

  if (convRes.isErr()) {
    return new Err(
      new Error(`Failed to create conversation: ${convRes.error.message}`)
    );
  }

  const { conversation, message: createdUserMessage } = convRes.value;

  if (!createdUserMessage) {
    return new Err(new Error("Failed to retrieve the created message."));
  }

  // Send notification for single query mode
  if (_meta?.progressToken && sendNotification) {
    const notification: MCPProgressNotificationType = {
      method: "notifications/progress",
      params: {
        progress: 1,
        total: 1,
        progressToken: _meta.progressToken,
        data: {
          label: `Running agent ${childAgentBlob.name}`,
          output: {
            type: "run_agent",
            query,
            childAgentId: childAgentId,
            conversationId: conversation.sId,
          },
        },
      },
    };
    await sendNotification(notification);
  }

  const streamRes = await api.streamAgentAnswerEvents({
    conversation: conversation,
    userMessageId: createdUserMessage.sId,
  });

  if (streamRes.isErr()) {
    return new Err(
      new Error(`Failed to stream agent answer: ${streamRes.error.message}`)
    );
  }

  let finalContent = "";
  let chainOfThought = "";
  let refs: Record<string, CitationType> = {};
  let files: ActionGeneratedFileType[] = [];
  try {
    for await (const event of streamRes.value.eventStream) {
      if (event.type === "generation_tokens") {
        if (event.classification === "chain_of_thought") {
          chainOfThought += event.text;
          if (sendNotification) {
            const notification: MCPProgressNotificationType = {
              method: "notifications/progress",
              params: {
                progress: 0,
                total: 1,
                progressToken: 0,
                data: {
                  label: "Agent thinking...",
                  output: {
                    type: "run_agent_chain_of_thought",
                    childAgentId: childAgentId,
                    conversationId: conversation.sId,
                    chainOfThought: chainOfThought,
                  },
                },
              },
            };
            await sendNotification(notification);
          }
        } else if (event.classification === "tokens") {
          finalContent += event.text;
          if (sendNotification) {
            const notification: MCPProgressNotificationType = {
              method: "notifications/progress",
              params: {
                progress: 0,
                total: 1,
                progressToken: 0,
                data: {
                  label: "Agent responding...",
                  output: {
                    type: "run_agent_generation_tokens",
                    childAgentId: childAgentId,
                    conversationId: conversation.sId,
                    text: finalContent,
                  },
                },
              },
            };
            await sendNotification(notification);
          }
        } else if (
          event.classification === "closing_delimiter" &&
          event.delimiterClassification === "chain_of_thought" &&
          chainOfThought.length > 0
        ) {
          chainOfThought += "\n";
          if (sendNotification) {
            const notification: MCPProgressNotificationType = {
              method: "notifications/progress",
              params: {
                progress: 0,
                total: 1,
                progressToken: 0,
                data: {
                  label: "Agent thinking...",
                  output: {
                    type: "run_agent_chain_of_thought",
                    childAgentId: childAgentId,
                    conversationId: conversation.sId,
                    chainOfThought: chainOfThought,
                  },
                },
              },
            };
            await sendNotification(notification);
          }
        }
      } else if (event.type === "agent_error") {
        return new Err(new Error(`Agent error: ${event.error.message}`));
      } else if (event.type === "user_message_error") {
        return new Err(new Error(`User message error: ${event.error.message}`));
      } else if (event.type === "agent_message_success") {
        if (isMCPActionArray(event.message.actions)) {
          refs = getCitationsFromActions(event.message.actions);
          files = event.message.actions.flatMap(
            (action) => action.generatedFiles
          );
        }
        break;
      } else if (event.type === "tool_approve_execution" && sendNotification) {
        const notification: MCPProgressNotificationType = {
          method: "notifications/progress",
          params: {
            progress: 0,
            total: 1,
            progressToken: 0,
            data: {
              label: "Waiting for tool approval...",
              output: {
                type: "tool_approval_bubble_up",
                configurationId: event.configurationId,
                conversationId: event.conversationId,
                messageId: event.messageId,
                actionId: event.actionId,
                metadata: event.metadata,
                stake: event.stake,
                inputs: event.inputs,
              },
            },
          },
        };
        await sendNotification(notification);
      }
    }
  } catch (streamError) {
    return new Err(
      new Error(
        `Error processing agent stream: ${normalizeError(streamError).message}`
      )
    );
  }

  finalContent = finalContent.trim();
  chainOfThought = chainOfThought.trim();

  return new Ok({
    conversationId: conversation.sId,
    text: finalContent,
    chainOfThought: chainOfThought.length > 0 ? chainOfThought : undefined,
    uri: `${config.getClientFacingUrl()}/w/${auth.getNonNullableWorkspace().sId}/assistant/${conversation.sId}`,
    refs: Object.keys(refs).length > 0 ? refs : undefined,
    files: files.length > 0 ? files : undefined,
  });
}

export default async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = new McpServer(serverInfo);
  const owner = auth.getNonNullableWorkspace();

  let childAgentId: string | null = null;

  if (
    agentLoopContext &&
    agentLoopContext.listToolsContext &&
    isServerSideMCPServerConfiguration(
      agentLoopContext.listToolsContext.agentActionConfiguration
    ) &&
    agentLoopContext.listToolsContext.agentActionConfiguration.childAgentId
  ) {
    childAgentId =
      agentLoopContext.listToolsContext.agentActionConfiguration.childAgentId;
  }

  if (
    agentLoopContext &&
    agentLoopContext.runContext &&
    isServerSideMCPToolConfiguration(
      agentLoopContext.runContext.actionConfiguration
    ) &&
    agentLoopContext.runContext.actionConfiguration.childAgentId
  ) {
    childAgentId = agentLoopContext.runContext.actionConfiguration.childAgentId;
  }

  let childAgentBlob: {
    name: string;
    description: string;
  } | null = null;

  if (childAgentId) {
    childAgentBlob = await leakyGetAgentNameAndDescriptionForChildAgent(
      auth,
      childAgentId
    );
  }

  // If we have no child ID (unexpected) or the child agent was archived, return a dummy server
  // whose tool name and description informs the agent of the situation.
  if (!childAgentBlob) {
    server.tool(
      "run_agent_tool_not_available",
      "No child agent configured for this tool, as the child agent was probably archived. " +
        "Do not attempt to run the tool and warn the user instead.",
      {
        childAgent:
          ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
      },
      async () => makeMCPToolTextError("No child agent configured")
    );
    return server;
  }

  server.tool(
    `run_${childAgentBlob.name}`,
    `Run agent ${childAgentBlob.name} (${childAgentBlob.description})`,
    {
      query: z
        .string()
        .describe(
          "The query sent to the agent. This is the question or instruction that will be " +
            "processed by the agent, which will respond with its own capabilities and knowledge."
        )
        .optional(),
      queries: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of queries to send to the agent. Each query will be processed independently in parallel. " +
            "Use this instead of 'query' when you need to run multiple queries."
        )
        .optional(),
      childAgent:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
    },
    async (
      { query, queries, childAgent: { uri } },
      { sendNotification, _meta }
    ) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required where the tool is called"
      );
      const { agentConfiguration: mainAgent, conversation: mainConversation } =
        agentLoopContext.runContext;

      const childAgentIdRes = parseAgentConfigurationUri(uri);
      if (childAgentIdRes.isErr()) {
        return makeMCPToolTextError(childAgentIdRes.error.message);
      }
      const childAgentId = childAgentIdRes.value;

      // Validate input - either query or queries must be provided
      if (!query && (!queries || queries.length === 0)) {
        return makeMCPToolTextError(
          "Either 'query' or 'queries' must be provided"
        );
      }
      if (query && queries && queries.length > 0) {
        return makeMCPToolTextError(
          "Cannot provide both 'query' and 'queries'"
        );
      }

      const user = auth.user();
      const prodCredentials = await prodAPICredentialsForOwner(owner);
      const api = new DustAPI(
        config.getDustAPIConfig(),
        {
          ...prodCredentials,
          extraHeaders: {
            ...getHeaderFromUserEmail(user?.email),
          },
        },
        logger
      );

      const queriesToRun = query ? [query] : queries!;
      const activeQueries = queriesToRun.map((q, index) => ({
        index,
        query: q,
        conversationId: "",
        status: "pending" as "pending" | "running" | "completed" | "failed",
        error: undefined as string | undefined,
        text: undefined as string | undefined,
        chainOfThought: undefined as string | undefined,
        uri: undefined as string | undefined,
      }));

      // Send initial batch progress notification
      if (sendNotification) {
        await sendNotification({
          method: "notifications/progress",
          params: {
            progress: 0,
            total: queriesToRun.length,
            progressToken: _meta?.progressToken || 0,
            data: {
              label: `Running ${queriesToRun.length} queries with ${childAgentBlob.name}\n${queriesToRun.map((q, i) => `• Query ${i + 1}: ${q.length > 50 ? q.substring(0, 50) + "..." : q}`).join("\n")}`,
              output: {
                type: "run_agent_progress",
                childAgentId,
                totalQueries: queriesToRun.length,
                completedQueries: 0,
                activeQueries,
              },
            },
          },
        });
      }

      const results = await concurrentExecutor(
        queriesToRun.map((q, index) => ({ query: q, index })),
        async ({ query: q, index }) => {
          // Update status to running
          activeQueries[index].status = "running";
          if (sendNotification) {
            await sendNotification({
              method: "notifications/progress",
              params: {
                progress: activeQueries.filter(
                  (q) => q.status === "completed" || q.status === "failed"
                ).length,
                total: queriesToRun.length,
                progressToken: _meta?.progressToken || 0,
                data: {
                  label: `Running query ${index + 1}/${queriesToRun.length}: ${q.length > 60 ? q.substring(0, 60) + "..." : q}`,
                  output: {
                    type: "run_agent_progress",
                    childAgentId,
                    totalQueries: queriesToRun.length,
                    completedQueries: activeQueries.filter(
                      (q) => q.status === "completed"
                    ).length,
                    activeQueries,
                  },
                },
              },
            });
          }

          const result = await runSingleAgent({
            api,
            mainAgent,
            mainConversation,
            childAgentBlob,
            childAgentId,
            query: q,
            agentLoopContext,
            sendNotification: async (notification: any) => {
              // Capture conversation ID and streaming updates from single agent notifications
              const output = notification.params?.data?.output;
              if (output?.conversationId) {
                activeQueries[index].conversationId = output.conversationId;
              }
              if (output?.type === "run_agent_chain_of_thought") {
                activeQueries[index].chainOfThought = output.chainOfThought;
              }
              if (output?.type === "run_agent_generation_tokens") {
                activeQueries[index].text = output.text;
              }

              // Send batch progress update with streaming data
              if (sendNotification) {
                await sendNotification({
                  method: "notifications/progress",
                  params: {
                    progress: activeQueries.filter(
                      (q) => q.status === "completed" || q.status === "failed"
                    ).length,
                    total: queriesToRun.length,
                    progressToken: _meta?.progressToken || 0,
                    data: {
                      label: `Streaming query ${index + 1}/${queriesToRun.length}`,
                      output: {
                        type: "run_agent_progress",
                        childAgentId,
                        totalQueries: queriesToRun.length,
                        completedQueries: activeQueries.filter(
                          (q) => q.status === "completed"
                        ).length,
                        activeQueries,
                      },
                    },
                  },
                });
              }
            },
            _meta,
            auth,
            queryIndex: index,
          });

          // Update status based on result
          if (result.isErr()) {
            activeQueries[index].status = "failed";
            activeQueries[index].error = result.error.message;
          } else {
            activeQueries[index].status = "completed";
            activeQueries[index].conversationId = result.value.conversationId;
            activeQueries[index].text = result.value.text;
            activeQueries[index].chainOfThought = result.value.chainOfThought;
            activeQueries[index].uri = result.value.uri;
          }

          // Send progress update
          if (sendNotification) {
            await sendNotification({
              method: "notifications/progress",
              params: {
                progress: activeQueries.filter(
                  (q) => q.status === "completed" || q.status === "failed"
                ).length,
                total: queriesToRun.length,
                progressToken: _meta?.progressToken || 0,
                data: {
                  label: `Progress: ${activeQueries.filter((q) => q.status === "completed" || q.status === "failed").length}/${queriesToRun.length} completed\n${activeQueries
                    .map((aq, i) => {
                      const statusIcon =
                        aq.status === "completed"
                          ? "✓"
                          : aq.status === "failed"
                            ? "✗"
                            : aq.status === "running"
                              ? "→"
                              : "•";
                      const queryText =
                        aq.query.length > 40
                          ? aq.query.substring(0, 40) + "..."
                          : aq.query;
                      return `${statusIcon} Query ${i + 1}: ${queryText}`;
                    })
                    .join("\n")}`,
                  output: {
                    type: "run_agent_progress",
                    childAgentId,
                    totalQueries: queriesToRun.length,
                    completedQueries: activeQueries.filter(
                      (q) => q.status === "completed"
                    ).length,
                    activeQueries,
                  },
                },
              },
            });
          }

          return { index, query: q, result };
        },
        { concurrency: 5 } // Max 5 concurrent sub-agents
      );

      // Format batch results and collect all files
      const allFiles: ActionGeneratedFileType[] = [];
      const batchResults = results.map(({ query: q, result }) => {
        if (result.isErr()) {
          return {
            conversationId: "",
            query: q,
            text: "",
            chainOfThought: undefined,
            uri: "",
            error: result.error.message,
            refs: undefined,
          };
        }
        // Collect files from successful results
        if (result.value.files) {
          allFiles.push(...result.value.files);
        }
        return {
          conversationId: result.value.conversationId,
          query: q,
          text: result.value.text,
          chainOfThought: result.value.chainOfThought,
          uri: result.value.uri,
          error: undefined,
          refs: result.value.refs,
        };
      });

      return {
        isError: false,
        content: [
          {
            type: "resource",
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_QUERIES,
              queries: queriesToRun,
              childAgentId: childAgentId,
              text: `Running ${queriesToRun.length} queries`,
              uri: "",
            },
          },
          {
            type: "resource",
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_RESULTS,
              results: batchResults,
              text: `Completed ${batchResults.filter((r) => !r.error).length}/${batchResults.length} queries successfully`,
              uri: "",
            },
          },
          ...allFiles.map((file) => ({
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              fileId: file.fileId,
              title: file.title,
              contentType: file.contentType,
              snippet: file.snippet,
              uri: "", // For batch mode, no single conversation URL
              text: "File generated by sub-agent",
            },
          })),
        ],
      };
    }
  );

  return server;
}
