import { ArrowPathIcon, Button, Spinner } from "@dust-tt/sparkle";
import React, { useCallback, useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import ConversationSidePanelContent from "@app/components/assistant/conversation/ConversationSidePanelContent";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import ConversationViewer from "@app/components/assistant/conversation/ConversationViewer";
import { GenerationContextProvider } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  createConversationWithMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { useSendNotification } from "@app/hooks/useNotification";
import { useConversation } from "@app/lib/swr/conversations";
import { useUser } from "@app/lib/swr/user";
import type {
  AgentMention,
  ContentFragmentsType,
  MentionType,
  Result,
} from "@app/types";
import { Err, Ok } from "@app/types";
import { BlockedActionsProvider } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  COPILOT_SEED_PROMPT,
  COPILOT_STATE_WRAP_START,
  COPILOT_STATE_WRAP_END,
} from "@app/lib/assistant/copilot";
import { GLOBAL_AGENTS_SID } from "@app/types";
import type { TemplateActionPreset } from "@app/types/assistant/templates";
import { DustError } from "@app/lib/error";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";

// Copilot agent id shared constant

function useCopilotConversation() {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const sendNotification = useSendNotification();
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const { mcpServerViews } = useMCPServerViewsContext();

  const [conversationId, setConversationId] = useState<string | null>(null);
  // For reliability, mention an existing global agent (gpt-4) on the server.
  // UI still presents this as "Copilot".
  const SERVER_AGENT_SID = GLOBAL_AGENTS_SID.GPT4;
  const [stickyMentions, setStickyMentions] = useState<AgentMention[]>([
    { configurationId: SERVER_AGENT_SID },
  ]);

  const { conversation: swrConversation } = useConversation({
    conversationId: conversationId || "",
    workspaceId: owner.sId,
    options: {
      disabled: !conversationId,
    },
  });

  const conversation = swrConversation || null;

  const handleSubmit = async (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentsType
  ): Promise<Result<undefined, DustError>> => {
    if (!user) {
      return new Err(new DustError("internal_error", "No user found"));
    }

    // Ensure the promptWriter agent is always mentioned
    const hasPromptWriterMention = mentions.some(
      (m) => m.configurationId === SERVER_AGENT_SID
    );

    if (!hasPromptWriterMention) {
      mentions = [{ configurationId: SERVER_AGENT_SID }, ...mentions];
    }

    // Build a lightweight editor state snapshot (JSON) for Copilot context.
    const fullState = getValues();
    const actionsLight = (fullState.actions || []).map((a: any) => {
      if (a.type === "DATA_VISUALIZATION") {
        return {
          type: "DATA_VISUALIZATION",
          name: a.name,
          description: a.description,
        };
      } else if (a.type === "MCP") {
        const view = mcpServerViews.find(
          (v) => v.sId === a.configuration?.mcpServerViewId
        );
        const serverName = view?.server.name ?? null;
        const reqs = getMCPServerRequirements(view ?? null);
        const dsConf = a.configuration?.dataSourceConfigurations || null;
        const tblConf = a.configuration?.tablesConfigurations || null;
        const countSel = (conf: any) =>
          conf
            ? Object.values(conf).reduce(
                (sum: number, c: any) => sum + (c.selectedResources?.length || 0),
                0
              )
            : 0;
        const hasDS = dsConf && Object.keys(dsConf).length > 0;
        const hasTbl = tblConf && Object.keys(tblConf).length > 0;
        return {
          type: "MCP",
          name: a.name,
          description: a.description,
          serverName,
          requiresDataSelection:
            reqs.requiresDataSourceConfiguration ||
            reqs.requiresDataWarehouseConfiguration ||
            reqs.requiresTableConfiguration,
          hasDataSelection: !!(hasDS || hasTbl),
          selectedItemsApprox: countSel(dsConf) + countSel(tblConf),
          timeFrame: a.configuration?.timeFrame || null,
        };
      }
      return null;
    }).filter(Boolean);

    const availableToolIds = Array.from(
      new Set(["data_visualization", ...mcpServerViews.map((v) => v.server.name)])
    );

    // availableToolIds is included in the hidden <COPILOT_STATE> but not logged.

    const editorStateLight = {
      agentSettings: {
        name: fullState.agentSettings?.name,
        description: fullState.agentSettings?.description,
        scope: fullState.agentSettings?.scope,
        tags: (fullState.agentSettings?.tags || []).map((t: any) => t.name),
      },
      instructions: fullState.instructions,
      generationSettings: {
        modelSettings: fullState.generationSettings?.modelSettings,
        temperature: fullState.generationSettings?.temperature,
        reasoningEffort: fullState.generationSettings?.reasoningEffort,
        responseFormat: fullState.generationSettings?.responseFormat || null,
      },
      actions: actionsLight,
      availableToolIds,
      maxStepsPerRun: fullState.maxStepsPerRun,
    };
    const editorStateJson = JSON.stringify(editorStateLight, null, 2);
    const hiddenEditorStateBlock = `${COPILOT_STATE_WRAP_START}\nThis is the current state of this agent (JSON). Use it to update or rewrite the agent as requested.\n\n${editorStateJson}\n${COPILOT_STATE_WRAP_END}`;

    const effectiveInput = !conversation
      ? `${COPILOT_SEED_PROMPT}\n\n${hiddenEditorStateBlock}\n\n${input}`
      : `${hiddenEditorStateBlock}\n\n${input}`;
    const messageData = { input: effectiveInput, mentions, contentFragments };

    if (!conversation) {
      const result = await createConversationWithMessage({
        owner,
        user,
        messageData,
        visibility: "test",
      });

      if (result.isOk()) {
        setConversationId(result.value.sId);
        return new Ok(undefined);
      }

      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });

      return new Err(new DustError("internal_error", result.error.message));
    } else {
      const result = await submitMessage({
        owner,
        user,
        conversationId: conversation.sId,
        messageData,
      });

      if (result.isOk()) {
        return new Ok(undefined);
      }

      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });

      return new Err(new DustError("internal_error", result.error.message));
    }
  };

  const resetConversation = useCallback(() => {
    setConversationId(null);
  }, []);

  return {
    conversation,
    handleSubmit,
    resetConversation,
    stickyMentions,
    setStickyMentions,
  };
}

export function AgentBuilderCopilot() {
  const { owner, aiInstructions, setPresetActionToAdd } = useAgentBuilderContext();
  const { user } = useUser();
  const { currentPanel } = useConversationSidePanelContext();
  const { setValue, watch, getValues } = useFormContext<AgentBuilderFormData>();
  const sendNotification = useSendNotification();
  const { mcpServerViews, defaultMCPServerViews } = useMCPServerViewsContext();

  // Manage global inline review flag lifecycle for Copilot mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).DUST_INLINE_REVIEW_ENABLED = true;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).DUST_INLINE_REVIEW_ENABLED;
      }
    };
  }, []);

  // Watch the current instructions
  const currentInstructions = watch("instructions");
  const currentActions = watch("actions");

  // Derive tool ids present in the builder form
  const currentToolIds = React.useMemo(() => {
    const ids: string[] = [];
    for (const a of currentActions || []) {
      if (a.type === "DATA_VISUALIZATION") {
        ids.push("data_visualization");
      } else if (a.type === "MCP") {
        const view = mcpServerViews.find(
          (v) => v.sId === a.configuration.mcpServerViewId
        );
        if (view) ids.push(view.server.name);
      }
    }
    return ids;
  }, [currentActions, mcpServerViews]);

  const handleAddTool = React.useCallback(
    async (tool: { id: string }) => {
      const toolId = tool.id.trim().toLowerCase();
      const actions = getValues("actions");

      // Prevent duplicates
      if (currentToolIds.map((t) => t.toLowerCase()).includes(toolId)) {
        return true;
      }

      // Knowledge tools should open the knowledge drawer instead of directly adding.
      const knowledgeToolIds = new Set([
        "include_data",
        "extract_data",
        "search",
        "query_tables",
      ]);
      if (knowledgeToolIds.has(toolId)) {
        // Map toolId to a preset that opens the knowledge sheet with a close processing method.
        const preset: TemplateActionPreset | null = (() => {
          switch (toolId) {
            case "search":
              // Opens with Search pre-selected
              return {
                type: "RETRIEVAL_SEARCH",
                name: "Search",
                description: "Search across selected knowledge sources.",
                help: "Pick sources and describe the data to search.",
              } as TemplateActionPreset;
            case "include_data":
              // Opens with Include Data pre-selected
              return {
                type: "RETRIEVAL_SEARCH",
                name: "Include Data",
                description: "Include recent documents from selected sources.",
                help: "Pick sources and describe which data to include.",
              } as TemplateActionPreset;
            case "extract_data":
              return {
                type: "PROCESS",
                name: "Extract Data",
                description: "Extract structured data from documents.",
                help: "Pick sources and define what to extract.",
              } as TemplateActionPreset;
            case "query_tables":
              return {
                type: "TABLES_QUERY",
                name: "Query Tables",
                description: "Query structured data like tables/databases.",
                help: "Pick tables and describe the queries.",
              } as TemplateActionPreset;
            default:
              return null;
          }
        })();

        if (preset) {
          setPresetActionToAdd(preset);
          // Do not mark as added yet; completion depends on saving the sheet.
          return false;
        }
      }

      if (toolId === "data_visualization") {
        const dvAction: any = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "DATA_VISUALIZATION",
          name: "data_visualization",
          description: DATA_VISUALIZATION_SPECIFICATION.description,
          configuration: null,
        };
        setValue("actions", [...actions, dvAction], {
          shouldDirty: true,
          shouldValidate: true,
        });
        return true;
      }

      // Find a matching MCP server view by server.name
      const view =
        defaultMCPServerViews.find(
          (v) => v.server.name?.toLowerCase() === toolId
        ) ||
        mcpServerViews.find(
          (v) => v.server.name?.toLowerCase() === toolId
        ) ||
        null;

      if (!view) {
        sendNotification({
          title: "Tool not available",
          description: `No '${toolId}' tool is available in this workspace.`,
          type: "error",
        });
        return false;
      }

      // For tools that require configuration (run_agent, run_dust_app), open
      // the configuration sheet and only add the tool upon saving.
      if (toolId === "run_agent" || toolId === "run_dust_app") {
        window.dispatchEvent(
          new CustomEvent("dust:configure-mcp-server-view", {
            detail: { serverName: view.server.name },
          })
        );
        // Do not mark as added; completion happens when user saves the sheet.
        return false;
      }

      const newAction = getDefaultMCPAction(view);
      setValue("actions", [...actions, newAction], {
        shouldDirty: true,
        shouldValidate: true,
      });
      return true;
    },
    [getValues, setValue, defaultMCPServerViews, mcpServerViews, sendNotification, currentToolIds]
  );

  const {
    conversation,
    handleSubmit,
    resetConversation,
    stickyMentions,
    setStickyMentions,
  } = useCopilotConversation();

  // Auto-submit AI instructions when provided
  useEffect(() => {
    if (aiInstructions && !conversation && handleSubmit) {
      const timer = setTimeout(() => {
        handleSubmit(aiInstructions, [], {
          uploaded: [],
          contentNodes: [],
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [aiInstructions, conversation, handleSubmit]);

  // Apply instructions to the current agent
  const handleApplyInstructions = useCallback(
    (instructions: string) => {
      setValue("instructions", instructions, {
        shouldValidate: true,
        shouldDirty: true,
      });

      // Success notification removed (too noisy). Only notify on errors elsewhere.
    },
    [setValue]
  );

  if (!user) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col" aria-label="Agent copilot">
      <BlockedActionsProvider owner={owner} conversation={conversation}>
        <GenerationContextProvider>
          {/* Enable inline review globally while Copilot is mounted */}
          {(() => {
            if (typeof window !== "undefined") {
              (window as any).DUST_INLINE_REVIEW_ENABLED = true;
            }
            return null;
          })()}
          <div className={currentPanel ? "hidden" : "flex h-full flex-col"}>
            {conversation && (
              <div className="flex items-center justify-center px-6 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  icon={ArrowPathIcon}
                  onClick={resetConversation}
                  label="Clear conversation"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4">
              {!conversation ? (
                <div className="flex h-full items-center justify-center">
                  <div className="px-4 text-center">
                    <div className="mb-2 text-lg font-medium text-foreground">
                      Agent Copilot
                    </div>
                    <div className="max-w-sm text-muted-foreground">
                      <p className="text-sm">
                        Get help writing instructions for your agent.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <div
                    className={`flex-1 overflow-y-auto ${currentPanel ? "hidden" : ""}`}
                  >
                    <ConversationViewer
                      owner={owner}
                      user={user}
                      conversationId={conversation.sId}
                      onStickyMentionsChange={setStickyMentions}
                      onApplyInstructions={handleApplyInstructions}
                      currentInstructions={currentInstructions}
                      onAddTool={handleAddTool}
                      currentToolIds={currentToolIds}
                      isInModal
                      key={conversation.sId}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 border-t border-separator p-4">
              <AssistantInputBar
                owner={owner}
                onSubmit={handleSubmit}
                stickyMentions={stickyMentions}
                conversationId={conversation?.sId || null}
                actions={["attachment"]}
                disableAutoFocus
                isFloating={false}
              />
            </div>
          </div>

          <ConversationSidePanelContent
            conversation={conversation}
            owner={owner}
            currentPanel={currentPanel}
          />
        </GenerationContextProvider>
      </BlockedActionsProvider>
    </div>
  );
}
