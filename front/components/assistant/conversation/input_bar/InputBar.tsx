import _ from "lodash";
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";
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
  useConversationTools,
} from "@app/lib/swr/conversations";
import { useIsOnboardingConversation } from "@app/lib/swr/user";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";
import type {
  ContentFragmentsType,
  DataSourceViewContentNode,
  Result,
  RichMention,
  WorkspaceType,
} from "@app/types";
import { compareAgentsForSort, isEqualNode, isGlobalAgentId } from "@app/types";

const DEFAULT_INPUT_BAR_ACTIONS = [...INPUT_BAR_ACTIONS];

interface InputBarProps {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: RichMention[],
    contentFragments: ContentFragmentsType,
    selectedMCPServerViewIds?: string[]
  ) => Promise<Result<undefined, DustError>>;
  conversationId: string | null;
  stickyMentions?: RichMention[];
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus: boolean;
  isFloating?: boolean;
  isFloatingWithoutMargin?: boolean;
  isSubmitting?: boolean;
  disable?: boolean;
}

export const InputBar = React.memo(function InputBar({
  owner,
  onSubmit,
  conversationId,
  stickyMentions,
  actions = DEFAULT_INPUT_BAR_ACTIONS,
  disableAutoFocus = false,
  isFloating = true,
  isSubmitting = false,
  disable = false,
}: InputBarProps) {
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(isSubmitting);

  const [attachedNodes, setAttachedNodes] = useState<
    DataSourceViewContentNode[]
  >([]);

  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations } = useUnifiedAgentConfigurations({
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

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const { animate, setAnimate, getAndClearSelectedAgent } =
    useContext(InputBarContext);
  const { isOnboardingConversation } =
    useIsOnboardingConversation(conversationId);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedAgent = useMemo(
    () => getAndClearSelectedAgent(),
    [getAndClearSelectedAgent]
  );
  useEffect(() => {
    if (animate && !isAnimating) {
      setAnimate(false);
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
  }, [animate, isAnimating, setAnimate]);

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
    const mentions = _.uniqBy(rawMentions, "id");

    const uploadedFiles = fileUploaderService.getFileBlobs();
    const mentionedAgents = agentConfigurations.filter((a) =>
      mentions.some((m) => m.id === a.sId && m.type === "agent")
    );

    trackEvent({
      area: TRACKING_AREAS.CONVERSATION,
      object: "message_send",
      action: "submit",
      extra: {
        conversation_id: conversationId ?? "new",
        has_attachments: attachedNodes.length > 0 || uploadedFiles.length > 0,
        has_tools: selectedMCPServerViews.length > 0,
        has_agents: mentionedAgents.length > 0,
        has_default_agent: mentionedAgents.some((a) => isGlobalAgentId(a.sId)),
        has_custom_agent: mentionedAgents.some((a) => !isGlobalAgentId(a.sId)),
        is_new_conversation: !conversationId,
        agent_count: mentions.length,
        agent_ids: mentionedAgents.map((a) => a.sId).join(","),
        attachment_count: attachedNodes.length + uploadedFiles.length,
        tool_count: selectedMCPServerViews.length,
        tool_names: selectedMCPServerViews.map((t) => t.server.name).join(","),
        message_length: markdown.length,
      },
    });

    if (isOnboardingConversation) {
      trackEvent({
        area: TRACKING_AREAS.CONVERSATION,
        object: "onboarding_conversation",
        action: TRACKING_ACTIONS.SUBMIT,
      });
    }

    // When we are creating a new conversation, we will disable the input bar, show a loading
    // spinner and in case of error, re-enable the input bar
    if (!conversationId) {
      setLoading(true);
      setIsLocalSubmitting(true);

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
      setIsLocalSubmitting(false);
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

  useEffect(() => {
    setIsLocalSubmitting(isSubmitting);
  }, [isSubmitting]);

  return (
    <div className="flex w-full flex-col">
      <div
        className={classNames(
          "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch sm:flex-row",
          "rounded-2xl transition-all",
          "bg-muted-background dark:bg-muted-background-night",
          "border",
          "border-border-dark dark:border-border-dark/10",
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
            conversationId={conversationId}
            disable={disable}
          />
          <InputBarContainer
            actions={actions}
            disableAutoFocus={disableAutoFocus}
            allAgents={activeAgents}
            owner={owner}
            conversationId={conversationId}
            selectedAgent={selectedAgent}
            onEnterKeyDown={handleSubmit}
            stickyMentions={stickyMentions}
            fileUploaderService={fileUploaderService}
            isSubmitting={
              isLocalSubmitting || fileUploaderService.isProcessingFiles
            }
            disableInput={disable}
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
});
