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
import { DustError } from "@app/lib/error";

// Copilot agent id shared constant

function useCopilotConversation() {
  const { owner } = useAgentBuilderContext();
  const { user } = useUser();
  const sendNotification = useSendNotification();
  const { getValues } = useFormContext<AgentBuilderFormData>();

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

    // Build hidden editor state block (JSON) so the Copilot can rewrite the current agent.
    const editorState = getValues();
    const editorStateJson = JSON.stringify(editorState, null, 2);
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
  const { owner, aiInstructions } = useAgentBuilderContext();
  const { user } = useUser();
  const { currentPanel } = useConversationSidePanelContext();
  const { setValue, watch } = useFormContext<AgentBuilderFormData>();
  const sendNotification = useSendNotification();

  // Watch the current instructions
  const currentInstructions = watch("instructions");

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

      sendNotification({
        title: "Instructions Applied",
        description:
          "The copilot's instructions have been applied to your agent.",
        type: "success",
      });
    },
    [setValue, sendNotification]
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
          <div className={currentPanel ? "hidden" : "flex h-full flex-col"}>
            {conversation && (
              <div className="flex items-center justify-between px-6 py-3">
                <h2 className="font-semibold text-foreground dark:text-foreground-night">
                  Copilot Assistant
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  icon={ArrowPathIcon}
                  onClick={resetConversation}
                  label="Reset conversation"
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
