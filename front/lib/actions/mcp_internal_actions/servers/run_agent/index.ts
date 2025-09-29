import type {
  AgentMessagePublicType,
  ConversationPublicType,
} from "@dust-tt/client";
import { DustAPI, INTERNAL_MIME_TYPES, isAgentMessage } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import _ from "lodash";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getOrCreateConversation } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/conversation";
import type {
  ChildAgentBlob,
  RunAgentBlockingEvent,
} from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import { makeToolBlockedAwaitingInputResponse } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import {
  makeInternalMCPServer,
  makeMCPToolExit,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type {
  ActionGeneratedFileType,
  AgentLoopContextType,
} from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import { RUN_AGENT_ACTION_NUM_RESULTS } from "@app/lib/actions/utils";
import {
  getCitationsFromActions,
  getRefs,
} from "@app/lib/api/assistant/citations";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { getResourcePrefix } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { CitationType, Result } from "@app/types";
import {
  Err,
  getHeaderFromUserEmail,
  isGlobalAgentId,
  normalizeError,
  Ok,
} from "@app/types";

const RUN_AGENT_TOOL_LOG_NAME = "run_agent";

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

const configurableProperties = {
  executionMode: z
    .object({
      options: z
        .union([
          z
            .object({
              value: z.literal("run-agent"),
              label: z.literal("Agent runs in background"),
            })
            .describe(
              "The selected agent runs silently in a background conversation and passes results to the main agent."
            ),
          z
            .object({
              value: z.literal("handoff"),
              label: z.literal("Agent responds in conversation"),
            })
            .describe(
              "The selected agent takes over and responds directly in the conversation."
            ),
        ])
        .optional(),
      value: z.string(),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM),
    })
    .default({
      value: "run-agent",
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
    }),
  childAgent:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
};

export default async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("run_agent");
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
    isLightServerSideMCPToolConfiguration(
      agentLoopContext.runContext.toolConfiguration
    ) &&
    agentLoopContext.runContext.toolConfiguration.childAgentId
  ) {
    childAgentId = agentLoopContext.runContext.toolConfiguration.childAgentId;
  }

  let childAgentBlob: ChildAgentBlob | null = null;
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
      configurableProperties,
      withToolLogging(
        auth,
        { toolName: RUN_AGENT_TOOL_LOG_NAME, agentLoopContext },
        async () => new Err(new MCPError("No child agent configured"))
      )
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
        ),
      toolsetsToAdd: z
        .array(
          z
            .string()
            .regex(new RegExp(`^${getResourcePrefix("mcp_server_view")}_\\w+$`))
        )
        .describe(
          "The toolsets ids to add to the agent in addition to the ones already set in the agent configuration."
        )
        .optional()
        .nullable(),
      fileOrContentFragmentIds: z
        .array(z.string().regex(new RegExp(`^[_\\w]+$`)))
        .describe(
          "The filesId of the files to pass to the agent conversation. If the file is a content node, use the contentFragmentId instead."
        )
        .optional()
        .nullable(),
      conversationId: z
        .string()
        .describe("The conversation id where the sub-agent will run.")
        .optional()
        .nullable(),
      ...configurableProperties,
    },
    withToolLogging(
      auth,
      { toolName: RUN_AGENT_TOOL_LOG_NAME, agentLoopContext },
      async (
        {
          query,
          childAgent: { uri },
          executionMode,
          toolsetsToAdd,
          fileOrContentFragmentIds,
          conversationId,
        },
        { sendNotification, _meta }
      ) => {
        assert(
          agentLoopContext?.runContext,
          "agentLoopContext is required to run the run_agent tool"
        );

        const isHandoff = executionMode.value === "handoff";

        const {
          agentConfiguration: mainAgent,
          conversation: mainConversation,
        } = agentLoopContext.runContext;

        if (conversationId === mainConversation.sId) {
          return new Err(
            new MCPError(
              "Conversation id cannot be the same as the main conversation."
            )
          );
        }

        const childAgentIdRes = parseAgentConfigurationUri(uri);
        if (childAgentIdRes.isErr()) {
          return new Err(new MCPError(childAgentIdRes.error.message));
        }
        const childAgentId = childAgentIdRes.value;

        const user = auth.user();

        const prodCredentials = await prodAPICredentialsForOwner(owner);
        const api = new DustAPI(
          config.getDustAPIConfig(),
          {
            ...prodCredentials,
            extraHeaders: {
              // We use a system API key to override the user here (not groups and role) so that the
              // sub-agent can access the same spaces as the user but also as the sub-agent may rely
              // on personal actions that have to be operated in the name of the user initiating the
              // interaction.
              ...getHeaderFromUserEmail(user?.email),
            },
          },
          logger
        );

        if (_meta?.progressToken && sendNotification) {
          // Store the query resource immediately so it's available in the UI while the action is running.
          const storeResourceNotification: MCPProgressNotificationType = {
            method: "notifications/progress",
            params: {
              progress: 0,
              total: 1,
              progressToken: _meta.progressToken,
              data: {
                label: `Storing query resource`,
                output: {
                  type: "store_resource",
                  contents: [
                    {
                      type: "resource",
                      resource: {
                        mimeType:
                          INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_QUERY,
                        text: query,
                        childAgentId: childAgentId,
                        uri: "",
                      },
                    },
                  ],
                },
              },
            },
          };
          await sendNotification(storeResourceNotification);
        }

        const convRes = await getOrCreateConversation(
          api,
          agentLoopContext.runContext,
          {
            childAgentBlob,
            childAgentId,
            mainAgent,
            mainConversation,
            query,
            toolsetsToAdd: toolsetsToAdd ?? null,
            fileOrContentFragmentIds: fileOrContentFragmentIds ?? null,
            conversationId: isHandoff
              ? mainConversation.sId
              : conversationId ?? null,
          }
        );

        if (convRes.isErr()) {
          return new Err(convRes.error);
        }

        if (isHandoff) {
          return new Ok(
            makeMCPToolExit({
              message: `Query delegated to agent @${childAgentBlob.name}`,
              isError: false,
            }).content
          );
        }

        const { conversation, isNewConversation, userMessageId } =
          convRes.value;

        if (isNewConversation) {
          logger.info(
            {
              childConversationId: conversation.sId,
              conversationId: mainConversation.sId,
            },
            "Conversation created for run_agent"
          );
        }

        if (_meta?.progressToken && sendNotification && isNewConversation) {
          // Send notification indicating that a run_agent started to store resume state.
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
                  userMessageId,
                },
              },
            },
          };
          await sendNotification(notification);
        }

        // Helper to build the success content payload consistently (citations + files).
        const buildSuccessContent = ({
          conversationId,
          finalContent,
          chainOfThought,
          refsFromAgent,
          files,
        }: {
          conversationId: string;
          finalContent: string;
          chainOfThought: string;
          refsFromAgent: Record<string, CitationType>;
          files: ActionGeneratedFileType[];
        }) => {
          let text = finalContent;

          const convoUrl = `${config.getClientFacingUrl()}/w/${auth.getNonNullableWorkspace().sId}/assistant/${conversationId}`;
          const { citationsOffset } = agentLoopContext.runContext.stepContext;

          const refs = getRefs().slice(
            citationsOffset,
            citationsOffset + RUN_AGENT_ACTION_NUM_RESULTS
          );

          const newRefs: Record<string, CitationType> = {};
          Object.keys(refsFromAgent).forEach((refKeyFromAgent, index) => {
            const newRef = refs[index];
            if (newRef) {
              // Replace citation references only within :cite[...] blocks
              const citationRegex = new RegExp(
                `(:cite\\[[^\\]]*\\b)${refKeyFromAgent}\\b([^\\]]*\\])`,
                "g"
              );
              text = text.replace(citationRegex, `$1${newRef}$2`);
              newRefs[newRef] = refsFromAgent[refKeyFromAgent];
            } else {
              // Remove trailing or extra commas as we ran out of refs capacity.
              const citationRegex = new RegExp(
                `(:cite\\[[^\\]]*\\b)${refKeyFromAgent}\\b(?:,([^\\]]*\\])|([^\\]]*\\]))`,
                "g"
              );
              text = text.replace(citationRegex, "$1$2$3");
            }
          });

          // Clean up trailing commas and empty citations
          text = text.replace(/:cite\[([^\]]*),\]/g, ":cite[$1]");
          text = text.replaceAll(":cite[]", "");

          return [
            {
              type: "resource" as const,
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_RESULT,
                conversationId,
                text,
                chainOfThought:
                  chainOfThought && chainOfThought.length > 0
                    ? chainOfThought
                    : undefined,
                uri: convoUrl,
                refs: Object.keys(newRefs).length > 0 ? newRefs : undefined,
              },
            },
            ...files.map((file) => ({
              type: "resource" as const,
              resource: {
                mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
                fileId: file.fileId,
                title: file.title,
                contentType: file.contentType,
                snippet: file.snippet,
                uri: convoUrl,
                text: "File generated by a sub-agent",
                ...(file.hidden ? { hidden: true } : {}),
              },
            })),
          ];
        };

        const getFinishedContent = (agentMessage: AgentMessagePublicType) => {
          return {
            finalText: agentMessage.content ?? "",
            cot: agentMessage.chainOfThought ?? "",
            refsFromAgent: getCitationsFromActions(agentMessage.actions),
            files: agentMessage.actions.flatMap((action) =>
              action.generatedFiles.filter((f) => !f.hidden)
            ),
          };
        };
        // Early finish: if the child conversation already succeeded, return its stored result.
        const agentMessage = getLatestVersionByParentMessageId(
          conversation,
          userMessageId
        );

        if (agentMessage && agentMessage.status === "succeeded") {
          const { finalText, cot, refsFromAgent, files } =
            getFinishedContent(agentMessage);
          return new Ok(
            buildSuccessContent({
              conversationId: conversation.sId,
              finalContent: finalText,
              chainOfThought: cot,
              refsFromAgent,
              files,
            })
          );
        }

        const streamRes = await api.streamAgentAnswerEvents({
          conversation: conversation,
          userMessageId,
          options: {
            maxReconnectAttempts: 10,
            reconnectDelay: 10000,
            autoReconnect: true,
          },
        });

        if (streamRes.isErr()) {
          const errorMessage = `Failed to stream agent answer: ${streamRes.error.message}`;
          return new Err(new MCPError(errorMessage));
        }

        const collectedBlockingEvents: RunAgentBlockingEvent[] = [];

        // TODO(DURABLE_AGENT 2025-08-25): We should make this more robust and use the existing
        // conversation content if present.
        let finalContent = "";
        let chainOfThought = "";
        let refsFromAgent: Record<string, CitationType> = {};
        let files: ActionGeneratedFileType[] = [];
        try {
          for await (const event of streamRes.value.eventStream) {
            if (event.type === "generation_tokens") {
              // Separate content based on classification.
              if (event.classification === "chain_of_thought") {
                chainOfThought += event.text;
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
                if (sendNotification) {
                  await sendNotification(notification);
                }
              } else if (event.classification === "tokens") {
                finalContent += event.text;
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
                if (sendNotification) {
                  await sendNotification(notification);
                }
              } else if (
                event.classification === "closing_delimiter" &&
                event.delimiterClassification === "chain_of_thought" &&
                chainOfThought.length > 0
              ) {
                // For closing chain of thought delimiters, add a newline.
                chainOfThought += "\n";
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
                if (sendNotification) {
                  await sendNotification(notification);
                }
              }
            } else if (event.type === "agent_error") {
              const errorMessage = `Agent error: ${event.error.message}`;
              // Certain types of agent errors should not be tracked as run_agent tool execution
              // errors (they will be exposed to the model and will be tracked as errors from the
              // agentic loop in the sub agent conversation).
              const tracked = ![
                "retryable_model_error",
                "context_window_exceeded",
                "provider_internal_error",
              ].includes(event.error.metadata?.category);
              return new Err(
                new MCPError(errorMessage, {
                  tracked,
                })
              );
            } else if (event.type === "user_message_error") {
              const errorMessage = `User message error: ${event.error.message}`;
              return new Err(new MCPError(errorMessage));
            } else if (event.type === "agent_message_success") {
              refsFromAgent = getCitationsFromActions(event.message.actions);
              files = event.message.actions.flatMap((action) =>
                action.generatedFiles.filter((f) => !f.hidden)
              );
              break;
            } else if (event.type === "tool_approve_execution") {
              // Collect this blocking event.
              collectedBlockingEvents.push(event);

              // If this is the last blocking event for the step, throw an error to break the agent
              // loop until the user approves the execution.
              if (event.isLastBlockingEventForStep) {
                const blockedResponse = makeToolBlockedAwaitingInputResponse(
                  collectedBlockingEvents,
                  {
                    conversationId: conversation.sId,
                    userMessageId,
                  }
                );
                return new Ok(blockedResponse.content);
              }
            } else if (event.type === "tool_error") {
              // Handle personal authentication required errors.
              if (
                event.error.code ===
                "mcp_server_personal_authentication_required"
              ) {
                const metadata = event.error.metadata ?? {};

                collectedBlockingEvents.push({
                  type: "tool_personal_auth_required",
                  created: event.created,
                  configurationId: event.configurationId,
                  messageId: event.messageId,
                  conversationId: conversation.sId,
                  authError: {
                    mcpServerId: metadata.mcp_server_id,
                    provider: metadata.provider,
                    toolName: metadata.toolName,
                    message: metadata.message,
                    scope: metadata.scope,
                  },
                });

                if (event.isLastBlockingEventForStep) {
                  const blockedResponse = makeToolBlockedAwaitingInputResponse(
                    collectedBlockingEvents,
                    {
                      conversationId: conversation.sId,
                      userMessageId,
                    }
                  );
                  return new Ok(blockedResponse.content);
                }
              }
            }
          }
        } catch (streamError) {
          // Fallback: if the stream failed, check if the child completed successfully meanwhile.
          const refreshed = await api.getConversation({
            conversationId: conversation.sId,
          });
          if (refreshed.isOk()) {
            const conv2 = refreshed.value;
            const agentMessage = getLatestVersionByParentMessageId(
              conv2,
              userMessageId
            );
            if (agentMessage && agentMessage.status === "succeeded") {
              const { finalText, cot, refsFromAgent, files } =
                getFinishedContent(agentMessage);
              return new Ok(
                buildSuccessContent({
                  conversationId: conv2.sId,
                  finalContent: finalText,
                  chainOfThought: cot,
                  refsFromAgent,
                  files,
                })
              );
            }
          }

          const normalizedError = normalizeError(streamError);
          const isNotConnected = normalizedError.message === "Not connected";
          const errorMessage = `Error processing agent stream: ${normalizedError.message}`;
          return new Err(
            new MCPError(errorMessage, {
              tracked: !isNotConnected,
              cause: normalizedError,
            })
          );
        }
        finalContent = finalContent.trim();
        chainOfThought = chainOfThought.trim();

        return new Ok(
          buildSuccessContent({
            conversationId: conversation.sId,
            finalContent,
            chainOfThought,
            refsFromAgent,
            files,
          })
        );
      }
    )
  );

  return server;
}

function getLatestVersionByParentMessageId(
  conversation: ConversationPublicType,
  userMessageId: string
) {
  const messageIndex = conversation.content.findLastIndex((versions) => {
    const message = versions[versions.length - 1];
    return isAgentMessage(message) && message.parentMessageId === userMessageId;
  });

  return messageIndex !== -1
    ? _.maxBy(
        conversation.content[messageIndex] as AgentMessagePublicType[],
        (m) => m.version
      )
    : undefined;
}
