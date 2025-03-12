import { Button, cn, RainbowEffect, StopIcon } from "@dust-tt/sparkle";
import type {
  AgentMention,
  DataSourceViewContentNode,
  LightAgentConfigurationType,
  MentionType,
  Result,
  UploadedContentFragment,
  WorkspaceType,
} from "@dust-tt/types";
import { compareAgentsForSort } from "@dust-tt/types";
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
import type { DustError } from "@app/lib/error";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useConversation } from "@app/lib/swr/conversations";
import { useSpaces } from "@app/lib/swr/spaces";
import { classNames } from "@app/lib/utils";

const DEFAULT_INPUT_BAR_ACTIONS = [...INPUT_BAR_ACTIONS];

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
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: UploadedContentFragment[]
  ) => Promise<Result<undefined, DustError>>;
  conversationId: string | null;
  stickyMentions?: AgentMention[];
  additionalAgentConfiguration?: LightAgentConfigurationType;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus: boolean;
  isFloating?: boolean;
  isFloatingWithoutMargin?: boolean;
}) {
  const [disableSendButton, setDisableSendButton] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const rainbowEffectRef = useRef<HTMLDivElement>(null);

  const [attachedNodes, setAttachedNodes] = useState<
    DataSourceViewContentNode[]
  >([]);

  const { spaces } = useSpaces({ workspaceId: owner.sId });
  const spacesMap = useMemo(
    () =>
      Object.fromEntries(spaces?.map((space) => [space.sId, space.name]) || []),
    [spaces]
  );

  useEffect(() => {
    const container = rainbowEffectRef.current;
    if (!container) {
      return;
    }

    const onFocusIn = () => setIsFocused(true);
    const onFocusOut = () => setIsFocused(false);

    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("focusout", onFocusOut);

    return () => {
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  const { mutateConversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true }, // We just want to get the mutation function
  });

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

    // When we are creating a new conversation, we will disable the input bar, show a loading
    // spinner and in case of error, re-enable the input bar
    if (!conversationId) {
      setLoading(true);
      setDisableSendButton(true);

      const r = await onSubmit(
        markdown,
        mentions,
        fileUploaderService.getFileBlobs().map((cf) => {
          return {
            title: cf.filename,
            fileId: cf.fileId,
          };
        })
      );

      setLoading(false);
      setDisableSendButton(false);
      if (r.isOk()) {
        resetEditorText();
        fileUploaderService.resetUpload();
      }
    } else {
      void onSubmit(
        markdown,
        mentions,
        fileUploaderService.getFileBlobs().map((cf) => {
          return {
            title: cf.filename,
            fileId: cf.fileId,
          };
        })
      );

      resetEditorText();
      fileUploaderService.resetUpload();
    }
  };

  const handleNodesAttachmentSelect = (node: DataSourceViewContentNode) => {
    setAttachedNodes((prev) => [...prev, node]);
  };

  const handleNodesAttachmentRemove = (node: DataSourceViewContentNode) => {
    setAttachedNodes((prev) =>
      prev.filter((n) => n.internalId !== node.internalId)
    );
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
    await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel",
          messageIds: generationContext.generatingMessages
            .filter((m) => m.conversationId === conversationId)
            .map((m) => m.messageId),
        }),
      }
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

  return (
    <div className="flex w-full flex-col">
      {generationContext.generatingMessages.some(
        (m) => m.conversationId === conversationId
      ) && (
        <div className="flex justify-center px-4 pb-4">
          <Button
            className="mt-4"
            variant="outline"
            label={isStopping ? "Stopping generation..." : "Stop generation"}
            icon={StopIcon}
            onClick={handleStopGeneration}
            disabled={isStopping}
          />
        </div>
      )}

      <div ref={rainbowEffectRef} className="flex w-full flex-col">
        <RainbowEffect
          className="w-full"
          containerClassName="w-full"
          size={isFocused ? "large" : "medium"}
          disabled={!isFloating}
        >
          <div
            className={classNames(
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch pl-3 sm:flex-row",
              "rounded-3xl transition-all",
              "bg-muted-background dark:bg-muted-background-night",
              "border",
              "border-border-dark dark:border-border-dark-night",
              "sm:border-border-dark/50 sm:focus-within:border-border-dark",
              "dark:focus-within:border-border-dark-night sm:focus-within:border-border-dark",
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
                files={{ service: fileUploaderService }}
                nodes={{
                  items: attachedNodes,
                  spacesMap,
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
                onNodeSelect={handleNodesAttachmentSelect}
              />
            </div>
          </div>
        </RainbowEffect>
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
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: UploadedContentFragment[]
  ) => Promise<Result<undefined, DustError>>;
  stickyMentions?: AgentMention[];
  conversationId: string | null;
  additionalAgentConfiguration?: LightAgentConfigurationType;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus?: boolean;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 flex max-h-screen w-full",
        "pb-2",
        "sm:w-full sm:max-w-4xl sm:pb-8"
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
      />
    </div>
  );
}
