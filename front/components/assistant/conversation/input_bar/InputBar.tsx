import { Button, StopIcon } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import type { UploadedContentFragment } from "@dust-tt/types";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { useFileDrop } from "@app/components/assistant/conversation/FileUploaderContext";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBarCitations } from "@app/components/assistant/conversation/input_bar/InputBarCitations";
import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import InputBarContainer, {
  INPUT_BAR_ACTIONS,
} from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { compareAgentsForSort } from "@app/lib/assistant";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { classNames } from "@app/lib/utils";

const DEFAULT_INPUT_BAR_ACTIONS = [...INPUT_BAR_ACTIONS];

// AGENT MENTION

function AgentMention({
  agentConfiguration,
}: {
  agentConfiguration: LightAgentConfigurationType;
}) {
  return (
    <div
      className={classNames("inline-block font-medium text-brand")}
      contentEditable={false}
      data-agent-configuration-id={agentConfiguration?.sId}
      data-agent-name={agentConfiguration?.name}
    >
      @{agentConfiguration.name}
    </div>
  );
}

/**
 *
 * @param additionalAgentConfiguration when trying an assistant in a modal or drawer we
 * need to pass the agent configuration to the input bar (it may not be in the
 * user's list of assistants)
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
  isFloatingWithoutMargin = false,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: UploadedContentFragment[]
  ) => void;
  conversationId: string | null;
  stickyMentions?: AgentMention[];
  additionalAgentConfiguration?: LightAgentConfigurationType;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus: boolean;
  isFloating?: boolean;
  isFloatingWithoutMargin?: boolean;
}) {
  const { mutate } = useSWRConfig();

  const { agentConfigurations: baseAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "assistants-search",
    });

  // Files upload.

  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "conversation",
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

  const handleSubmit: InputBarContainerProps["onEnterKeyDown"] = (
    isEmpty,
    textAndMentions,
    resetEditorText
  ) => {
    if (isEmpty || fileUploaderService.isProcessingFiles) {
      return;
    }

    const { mentions: rawMentions, text } = textAndMentions;
    const mentions: MentionType[] = [
      ...new Set(rawMentions.map((mention) => mention.id)),
    ].map((id) => ({ configurationId: id }));

    if (fileUploaderService.fileBlobs.length > 0) {
      void ClientSideTracking.trackInputBarFileUploadUsed({
        fileCount: fileUploaderService.fileBlobs.length,
      });
    }

    onSubmit(
      text,
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
  };

  const [isProcessing, setIsProcessing] = useState<boolean>(false);

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
    setIsProcessing(true); // we don't set it back to false immediately cause it takes a bit of time to cancel
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
    await mutate(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}`
    );
  };

  useEffect(() => {
    if (
      isProcessing &&
      !generationContext.generatingMessages.some(
        (m) => m.conversationId === conversationId
      )
    ) {
      setIsProcessing(false);
    }
  }, [isProcessing, generationContext.generatingMessages, conversationId]);

  return (
    <div className="flex w-full flex-col">
      {generationContext.generatingMessages.some(
        (m) => m.conversationId === conversationId
      ) && (
        <div className="flex justify-center px-4 pb-4">
          <Button
            className="mt-4"
            variant="tertiary"
            label={isProcessing ? "Stopping generation..." : "Stop generation"}
            icon={StopIcon}
            onClick={handleStopGeneration}
            disabled={isProcessing}
          />
        </div>
      )}

      <div
        className={classNames(
          "flex flex-1 px-0",
          isFloating ? (isFloatingWithoutMargin ? "" : "sm:px-4") : ""
        )}
      >
        <div className="flex w-full flex-1 flex-col items-end self-stretch sm:flex-row">
          <div
            className={classNames(
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch pl-4 sm:flex-row",
              "border-struture-200 border-t bg-white/90 backdrop-blur focus-within:border-structure-300",
              "transition-all",
              isFloating
                ? "sm:rounded-3xl sm:border-b sm:border-l sm:border-r sm:border-element-500 sm:focus-within:border-action-300 sm:focus-within:shadow-md sm:focus-within:ring-1"
                : "",
              isAnimating ? "duration-600 animate-shake" : "duration-300"
            )}
          >
            <div className="relative flex w-full flex-1 flex-col">
              <InputBarCitations fileUploaderService={fileUploaderService} />

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
                disableSendButton={fileUploaderService.isProcessingFiles}
              />
            </div>
          </div>
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
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: UploadedContentFragment[]
  ) => void;
  stickyMentions?: AgentMention[];
  conversationId: string | null;
  additionalAgentConfiguration?: LightAgentConfigurationType;
  actions?: InputBarContainerProps["actions"];
  disableAutoFocus?: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-20 flex max-h-screen w-full max-w-4xl sm:pb-8">
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
