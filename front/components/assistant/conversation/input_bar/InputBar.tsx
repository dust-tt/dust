import { Button, cn, StopIcon } from "@dust-tt/sparkle";
import posthog from "posthog-js";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarAttachments } from "@app/components/assistant/conversation/input_bar/InputBarAttachments";
import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import InputBarContainer, {
  INPUT_BAR_ACTIONS,
} from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { DustError } from "@app/lib/error";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useAddDeleteConversationTool,
  useCancelMessage,
  useConversation,
  useConversationTools,
} from "@app/lib/swr/conversations";
import { TRACKING_AREAS } from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";
import type {
  AgentMention,
  ContentFragmentsType,
  DataSourceViewContentNode,
  LightAgentConfigurationType,
  MentionType,
  Result,
  WorkspaceType,
} from "@app/types";
import { compareAgentsForSort, isEqualNode } from "@app/types";

const DEFAULT_INPUT_BAR_ACTIONS = [...INPUT_BAR_ACTIONS];

interface AssistantInputBarProps {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentsType,
    selectedMCPServerViewIds?: string[]
  ) => Promise<Result<undefined, DustError>>;
  conversationId: string | null;
  stickyMentions?: AgentMention[];
  additionalAgentConfiguration?: LightAgentConfigurationType;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus: boolean;
  isFloating?: boolean;
  isFloatingWithoutMargin?: boolean;
  disable?: boolean;
}

/**
 *
 * @param additionalAgentConfiguration when trying an agent in a modal or drawer we
 * need to pass the agent configuration to the input bar (it may not be in the
 * user's list of agents)
 */
export function AssistantInputBar({
  owner,
  onSubmit,
  conversationId,
  stickyMentions,
  additionalAgentConfiguration,
  actions = DEFAULT_INPUT_BAR_ACTIONS,
  disableAutoFocus = false,
  isFloating = true,
  disable = false,
}: AssistantInputBarProps) {
  const [disableSendButton, setDisableSendButton] = useState(disable);

  const [attachedNodes, setAttachedNodes] = useState<
    DataSourceViewContentNode[]
  >([]);

  const { mutateConversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true }, // We just want to get the mutation function
  });
  const cancelMessage = useCancelMessage({ owner, conversationId });

  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations: baseAgentConfigurations } =
    useUnifiedAgentConfigurations({
      workspaceId: owner.sId,
    });

  // Files upload.

  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "conversation",
    useCaseMetadata: conversationId ? { conversationId } : undefined,
  });

  const { droppedFiles, setDroppedFiles } = useFileDrop();

  useEffect(() => {
    if (droppedFiles.length > 0) {
      // Handle the dropped files.
      void fileUploaderService.handleFilesUpload(droppedFiles);

      // Clear the dropped files after handling them.
      setDroppedFiles([]);
    }
  }, [droppedFiles, setDroppedFiles, fileUploaderService]);

  const agentConfigurations = useMemo(() => {
    if (
      baseAgentConfigurations.find(
        (a) => a.sId === additionalAgentConfiguration?.sId
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      ) ||
      !additionalAgentConfiguration
    ) {
      return baseAgentConfigurations;
    }
    return [...baseAgentConfigurations, additionalAgentConfiguration];
  }, [baseAgentConfigurations, additionalAgentConfiguration]);

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const { animate, selectedAssistant } = useContext(InputBarContext);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (animate && !isAnimating) {
      setIsAnimating(true);

      // Clear any existing timeout to ensure animations do not overlap.
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      // Set timeout to set setIsAnimating to false after the duration.
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        // Reset the ref after the timeout clears.
        animationTimeoutRef.current = null;
      }, 700);
    }
  }, [animate, isAnimating]);

  // Cleanup timeout on component unmount.
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Tools selection

  const [selectedMCPServerViews, setSelectedMCPServerViews] = useState<
    MCPServerViewType[]
  >([]);

  const { conversationTools } = useConversationTools({
    conversationId,
    workspaceId: owner.sId,
  });

  // The truth is in the conversationTools, we need to update the selectedMCPServerViewIds when the conversationTools change.
  useEffect(() => {
    setSelectedMCPServerViews(conversationTools);
  }, [conversationTools]);

  const { addTool, deleteTool } = useAddDeleteConversationTool({
    conversationId,
    workspaceId: owner.sId,
  });

  const handleMCPServerViewSelect = (serverView: MCPServerViewType) => {
    // Optimistic update
    setSelectedMCPServerViews((prev) => [...prev, serverView]);
    void addTool(serverView.sId);
  };

  const handleMCPServerViewDeselect = (serverView: MCPServerViewType) => {
    // Optimistic update
    setSelectedMCPServerViews((prev) =>
      prev.filter((sv) => sv.sId !== serverView.sId)
    );
    void deleteTool(serverView.sId);
  };

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const handleSubmit: InputBarContainerProps["onEnterKeyDown"] = async (
    isEmpty,
    markdownAndMentions,
    resetEditorText,
    setLoading
  ) => {
    if (isEmpty || fileUploaderService.isProcessingFiles) {
      return;
    }

    const { mentions: rawMentions, markdown } = markdownAndMentions;
    const mentions: MentionType[] = [
      ...new Set(rawMentions.map((mention) => mention.id)),
    ].map((id) => ({ configurationId: id }));

    // Track message submission
    if (posthog.__loaded) {
      posthog.capture(`${TRACKING_AREAS.CONVERSATION}:message_send_submit`, {
        area: TRACKING_AREAS.CONVERSATION,
        object: "message_send",
        action: "submit",
        has_attachments: attachedNodes.length > 0 ? "true" : "false",
        has_tools: selectedMCPServerViews.length > 0 ? "true" : "false",
        has_assistant: selectedAssistant ? "true" : "false",
      });
    }

    // When we are creating a new conversation, we will disable the input bar, show a loading
    // spinner and in case of error, re-enable the input bar
    if (!conversationId) {
      setLoading(true);
      setDisableSendButton(true);

      const r = await onSubmit(
        markdown,
        mentions,
        {
          uploaded: fileUploaderService.getFileBlobs().map((cf) => {
            return {
              title: cf.filename,
              fileId: cf.fileId,
              contentType: cf.contentType,
            };
          }),
          contentNodes: attachedNodes,
        },
        // Only send the selectedMCPServerViewIds if we are creating a new conversation.
        // Once the conversation is created, the selectedMCPServerViewIds will be updated in the conversationTools hook.
        selectedMCPServerViews.map((sv) => sv.sId)
      );

      setLoading(false);
      setDisableSendButton(false);
      if (r.isOk()) {
        resetEditorText();
        fileUploaderService.resetUpload();
      }
    } else {
      void onSubmit(markdown, mentions, {
        uploaded: fileUploaderService.getFileBlobs().map((cf) => {
          return {
            title: cf.filename,
            fileId: cf.fileId,
            contentType: cf.contentType,
          };
        }),
        contentNodes: attachedNodes,
      });

      resetEditorText();
      fileUploaderService.resetUpload();
      setAttachedNodes([]);
    }
  };

  const handleNodesAttachmentSelect = (node: DataSourceViewContentNode) => {
    const isNodeAlreadyAttached = attachedNodes.some((attachedNode) =>
      isEqualNode(attachedNode, node)
    );
    if (!isNodeAlreadyAttached) {
      setAttachedNodes((prev) => [...prev, node]);
    }
  };

  const handleNodesAttachmentRemove = (node: DataSourceViewContentNode) => {
    setAttachedNodes((prev) => prev.filter((n) => !isEqualNode(n, node)));
  };

  const [isStopping, setIsStopping] = useState<boolean>(false);

  // GenerationContext: to know if we are generating or not
  const generationContext = useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "FixedAssistantInputBar must be used within a GenerationContextProvider"
    );
  }

  const handleStopGeneration = async () => {
    if (!conversationId) {
      return;
    }
    setIsStopping(true); // we don't set it back to false immediately cause it takes a bit of time to cancel
    await cancelMessage(
      generationContext.generatingMessages
        .filter((m) => m.conversationId === conversationId)
        .map((m) => m.messageId)
    );
    mutateConversation();
  };

  useEffect(() => {
    if (
      isStopping &&
      !generationContext.generatingMessages.some(
        (m) => m.conversationId === conversationId
      )
    ) {
      setIsStopping(false);
    }
  }, [isStopping, generationContext.generatingMessages, conversationId]);

  useEffect(() => {
    setDisableSendButton(disable);
  }, [disable]);

  const getStopButtonLabel = () => {
    if (isStopping) {
      return "Stopping...";
    }
    const generatingCount = generationContext.generatingMessages.filter(
      (m) => m.conversationId === conversationId
    ).length;
    return generatingCount > 1 ? "Stop all agents" : "Stop agent";
  };

  return (
    <div className="flex w-full flex-col">
      {generationContext.generatingMessages.some(
        (m) => m.conversationId === conversationId
      ) && (
        <div className="flex justify-center px-4 pb-4">
          <Button
            variant="outline"
            label={getStopButtonLabel()}
            icon={StopIcon}
            onClick={handleStopGeneration}
            disabled={isStopping}
          />
        </div>
      )}

      <div
        className={classNames(
          "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch sm:flex-row",
          "rounded-2xl transition-all",
          "bg-muted-background dark:bg-muted-background-night",
          "border",
          "border-border-dark dark:border-border-dark-night",
          "sm:border-border-dark/50 sm:focus-within:border-border-dark",
          "dark:focus-within:border-border-dark-night sm:focus-within:border-border-dark",
          disable && "cursor-not-allowed opacity-75",
          isFloating
            ? classNames(
                "focus-within:ring-1 dark:focus-within:ring-1",
                "dark:focus-within:ring-highlight/30-night focus-within:ring-highlight/30",
                "sm:focus-within:ring-2 dark:sm:focus-within:ring-2"
              )
            : classNames(
                "focus-within:border-highlight-300",
                "dark:focus-within:border-highlight-300-night"
              ),
          isAnimating ? "duration-600 animate-shake" : "duration-300"
        )}
      >
        <div className="relative flex w-full flex-1 flex-col">
          <InputBarAttachments
            owner={owner}
            files={{ service: fileUploaderService }}
            nodes={{
              items: attachedNodes,
              onRemove: handleNodesAttachmentRemove,
            }}
          />
          <InputBarContainer
            actions={actions}
            disableAutoFocus={disableAutoFocus}
            allAssistants={activeAgents}
            agentConfigurations={agentConfigurations}
            owner={owner}
            selectedAssistant={selectedAssistant}
            onEnterKeyDown={handleSubmit}
            stickyMentions={stickyMentions}
            fileUploaderService={fileUploaderService}
            disableSendButton={
              disableSendButton || fileUploaderService.isProcessingFiles
            }
            disableTextInput={disable}
            onNodeSelect={handleNodesAttachmentSelect}
            onNodeUnselect={handleNodesAttachmentRemove}
            selectedMCPServerViews={selectedMCPServerViews}
            onMCPServerViewSelect={handleMCPServerViewSelect}
            onMCPServerViewDeselect={handleMCPServerViewDeselect}
            attachedNodes={attachedNodes}
          />
        </div>
      </div>
    </div>
  );
}

export function FixedAssistantInputBar({
  owner,
  onSubmit,
  stickyMentions,
  conversationId,
  additionalAgentConfiguration,
  actions = DEFAULT_INPUT_BAR_ACTIONS,
  disableAutoFocus = false,
  disable = false,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentsType,
    selectedMCPServerViewIds?: string[]
  ) => Promise<Result<undefined, DustError>>;
  stickyMentions?: AgentMention[];
  conversationId: string | null;
  additionalAgentConfiguration?: LightAgentConfigurationType;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus?: boolean;
  disable?: boolean;
}) {
  return (
    <div
      className={cn(
        "max-h-dvh sticky bottom-0 z-20 flex w-full",
        "pb-2",
        "sm:w-full sm:max-w-3xl sm:pb-4"
      )}
    >
      <AssistantInputBar
        owner={owner}
        onSubmit={onSubmit}
        conversationId={conversationId}
        stickyMentions={stickyMentions}
        additionalAgentConfiguration={additionalAgentConfiguration}
        actions={actions}
        disableAutoFocus={disableAutoFocus}
        disable={disable}
      />
    </div>
  );
}
