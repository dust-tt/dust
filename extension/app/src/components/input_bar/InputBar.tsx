import type {
  AgentMentionType,
  ConversationPublicType,
  ExtensionWorkspaceType,
  LightAgentConfigurationType,
} from "@dust-tt/client";
import { Button, Page, Spinner, StopIcon } from "@dust-tt/sparkle";
import { usePublicAgentConfigurations } from "@extension/components/assistants/usePublicAgentConfigurations";
import { useFileDrop } from "@extension/components/conversation/FileUploaderContext";
import { GenerationContext } from "@extension/components/conversation/GenerationContextProvider";
import { InputBarCitations } from "@extension/components/input_bar/InputBarCitations";
import type { InputBarContainerProps } from "@extension/components/input_bar/InputBarContainer";
import { InputBarContainer } from "@extension/components/input_bar/InputBarContainer";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { useFileUploaderService } from "@extension/hooks/useFileUploaderService";
import { useDustAPI } from "@extension/lib/dust_api";
import type { AttachSelectionMessage } from "@extension/lib/messages";
import { sendInputBarStatus } from "@extension/lib/messages";
import type { UploadedFileWithKind } from "@extension/lib/types";
import { classNames, compareAgentsForSort } from "@extension/lib/utils";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 *
 * @param additionalAgentConfiguration when trying an agent in a modal or drawer we
 * need to pass the agent configuration to the input bar (it may not be in the
 * user's list of agents)
 */
export function AssistantInputBar({
  owner,
  onSubmit,
  stickyMentions,
  additionalAgentConfiguration,
  disableAutoFocus = false,
  conversation,
  isTabIncluded,
  setIncludeTab,
  isSubmitting,
}: {
  owner: ExtensionWorkspaceType;
  onSubmit: (
    input: string,
    mentions: AgentMentionType[],
    contentFragments: UploadedFileWithKind[]
  ) => void;
  stickyMentions?: AgentMentionType[];
  additionalAgentConfiguration?: LightAgentConfigurationType;
  disableAutoFocus?: boolean;
  conversation?: ConversationPublicType;
  isTabIncluded: boolean;
  setIncludeTab: (includeTab: boolean) => void;
  isSubmitting?: boolean;
}) {
  const dustAPI = useDustAPI();

  const { agentConfigurations: baseAgentConfigurations } =
    usePublicAgentConfigurations();

  const fileUploaderService = useFileUploaderService(conversation?.sId);
  const {
    isCapturing,
    uploadContentTab,
    handleFilesUpload,
    getFileBlobs,
    resetUpload,
  } = fileUploaderService;

  useEffect(() => {
    void sendInputBarStatus(true);
    const listener = async (message: AttachSelectionMessage) => {
      const { type } = message;
      if (type === "EXT_ATTACH_TAB") {
        // Handle message
        void uploadContentTab(message);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      void sendInputBarStatus(false);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const { droppedFiles, setDroppedFiles } = useFileDrop();

  useEffect(() => {
    if (droppedFiles.length > 0) {
      // Handle the dropped files.
      void handleFilesUpload({
        files: droppedFiles,
        kind: "attachment",
      });

      // Clear the dropped files after handling them.
      setDroppedFiles([]);
    }
  }, [droppedFiles, setDroppedFiles, handleFilesUpload]);

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

  // GenerationContext: to know if we are generating or not
  const generationContext = useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "FixedAssistantInputBar must be used within a GenerationContextProvider"
    );
  }

  // Handle stopping the generation of messages.
  const [isStopping, setIsStopping] = useState<boolean>(false);

  const handleStopGeneration = async () => {
    if (!conversation?.id) {
      return;
    }
    setIsStopping(true); // we don't set it back to false immediately cause it takes a bit of time to cancel

    const r = await dustAPI.cancelMessageGeneration({
      conversationId: conversation.sId,
      messageIds: generationContext.generatingMessages
        .filter((m) => m.conversationId === conversation.sId)
        .map((m) => m.messageId),
    });

    if (r.isOk()) {
      // The generation was successfully stopped.
      // do we want to mutate the conversation ?
    }
  };

  useEffect(() => {
    if (
      isStopping &&
      !generationContext.generatingMessages.some(
        (m) => m.conversationId === conversation?.sId
      )
    ) {
      setIsStopping(false);
    }
  }, [isStopping, generationContext.generatingMessages, conversation?.sId]);

  const { setAttachPageBlinking } = useContext(InputBarContext);

  const activeAgents = agentConfigurations.filter((a) => a.status === "active");
  activeAgents.sort(compareAgentsForSort);

  const handleSubmit: InputBarContainerProps["onEnterKeyDown"] = async (
    isEmpty,
    textAndMentions,
    resetEditorText,
    setLoading
  ) => {
    if (isEmpty) {
      return;
    }
    const { mentions: rawMentions, text } = textAndMentions;
    const mentions: AgentMentionType[] = [
      ...new Set(rawMentions.map((mention) => mention.id)),
    ].map((id) => ({ configurationId: id }));
    const newFiles = getFileBlobs().map((cf) => ({
      title: cf.filename,
      fileId: cf.fileId,
      url: cf.publicUrl,
      kind: cf.kind,
    }));

    setLoading(true);

    if (isTabIncluded) {
      const files = await uploadContentTab({
        includeContent: true,
        includeCapture: false,
        conversation,
        updateBlobs: false,
        onUpload: () => {
          setAttachPageBlinking(true);
        },
      });
      if (files) {
        newFiles.push(
          ...files.map((cf) => ({
            title: cf.filename,
            fileId: cf.fileId || "",
            url: cf.publicUrl,
            kind: cf.kind,
          }))
        );
      }
    }

    await onSubmit(text, mentions, newFiles);
    setLoading(false);
    resetEditorText();
    resetUpload();
  };

  const isGenerating = generationContext.generatingMessages.some(
    (m) => m.conversationId === conversation?.sId
  );

  return (
    <div className="flex w-full flex-col">
      {isCapturing && (
        <div className="fixed absolute inset-0 z-50 overflow-hidden">
          <div
            className={classNames(
              "fixed flex inset-0 backdrop-blur-sm transition-opacity",
              "bg-structure-50/80 dark:bg-structure-50-night/80"
            )}
          />
          <div className="fixed top-0 left-0 h-full w-full flex flex-col justify-center items-center gap-4">
            <span className="z-50">
              <Page.Header title="Screen capture in progress..." />
            </span>
            <Spinner size="xl" />
          </div>
        </div>
      )}
      {isGenerating && (
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

      <div className="flex flex-1 px-0">
        <div className="flex w-full flex-1 flex-col items-end self-stretch">
          <div
            className={classNames(
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch p-3",
              "border-struture-200 dark:border-struture-200-night",
              "border-t  backdrop-blur",
              "transition-all",
              "rounded-2xl border-b border-l border-r",
              "bg-muted-background dark:bg-muted-background-night",
              "border",
              "border-border-dark dark:border-border-dark-night",
              "sm:border-border-dark/50 sm:focus-within:border-border-dark",
              "dark:focus-within:border-border-dark-night sm:focus-within:border-border-dark",
              isAnimating ? "duration-600 animate-shake" : "duration-300"
            )}
          >
            <div className="relative flex w-full flex-1 flex-col">
              <InputBarCitations
                fileUploaderService={fileUploaderService}
                disabled={isSubmitting ?? false}
              />

              <InputBarContainer
                disableAutoFocus={disableAutoFocus}
                allAssistants={activeAgents}
                agentConfigurations={agentConfigurations}
                owner={owner}
                selectedAssistant={selectedAssistant}
                onEnterKeyDown={handleSubmit}
                stickyMentions={stickyMentions}
                isTabIncluded={isTabIncluded}
                setIncludeTab={setIncludeTab}
                fileUploaderService={fileUploaderService}
                isSubmitting={isSubmitting ?? false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
