import type {
  AgentMentionType,
  ConversationPublicType,
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/client";
import { Button, StopIcon } from "@dust-tt/sparkle";
import { usePublicAgentConfigurations } from "@extension/components/assistants/usePublicAgentConfigurations";
import { useFileDrop } from "@extension/components/conversation/FileUploaderContext";
import { GenerationContext } from "@extension/components/conversation/GenerationContextProvider";
import { InputBarCitations } from "@extension/components/input_bar/InputBarCitations";
import type { InputBarContainerProps } from "@extension/components/input_bar/InputBarContainer";
import { InputBarContainer } from "@extension/components/input_bar/InputBarContainer";
import { InputBarContext } from "@extension/components/input_bar/InputBarContext";
import { PortContext } from "@extension/components/PortContext";
import { useFileUploaderService } from "@extension/hooks/useFileUploaderService";
import { useDustAPI } from "@extension/lib/dust_api";
import type { AttachSelectionMessage } from "@extension/lib/messages";
import { sendInputBarStatus } from "@extension/lib/messages";
import type { UploadedFileWithKind } from "@extension/lib/types";
import { classNames, compareAgentsForSort } from "@extension/lib/utils";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 *
 * @param additionalAgentConfiguration when trying an assistant in a modal or drawer we
 * need to pass the agent configuration to the input bar (it may not be in the
 * user's list of assistants)
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
}: {
  owner: LightWorkspaceType;
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
}) {
  const dustAPI = useDustAPI();

  const { agentConfigurations: baseAgentConfigurations } =
    usePublicAgentConfigurations();

  const fileUploaderService = useFileUploaderService(conversation?.sId);

  const port = useContext(PortContext);
  useEffect(() => {
    if (port) {
      void sendInputBarStatus(true);
      const listener = async (message: AttachSelectionMessage) => {
        const { type } = message;
        if (type === "EXT_ATTACH_TAB") {
          // Handle message
          void fileUploaderService.uploadContentTab(message);
        }
      };
      port.onMessage.addListener(listener);
      return () => {
        void sendInputBarStatus(false);
        port.onMessage.removeListener(listener);
      };
    }
  }, []);

  const { droppedFiles, setDroppedFiles } = useFileDrop();

  useEffect(() => {
    if (droppedFiles.length > 0) {
      // Handle the dropped files.
      void fileUploaderService.handleFilesUpload({
        files: droppedFiles,
        kind: "attachment",
      });

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
    resetEditorText
  ) => {
    if (isEmpty) {
      return;
    }
    const { mentions: rawMentions, text } = textAndMentions;
    const mentions: AgentMentionType[] = [
      ...new Set(rawMentions.map((mention) => mention.id)),
    ].map((id) => ({ configurationId: id }));
    const newFiles = fileUploaderService.getFileBlobs().map((cf) => ({
      title: cf.filename,
      fileId: cf.fileId,
      url: cf.publicUrl,
      kind: cf.kind,
    }));

    resetEditorText();

    if (isTabIncluded) {
      const files = await fileUploaderService.uploadContentTab({
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

    onSubmit(text, mentions, newFiles);
    fileUploaderService.resetUpload();
  };

  const isGenerating = generationContext.generatingMessages.some(
    (m) => m.conversationId === conversation?.sId
  );

  return (
    <div className="flex w-full flex-col">
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
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch pl-4",
              "border-struture-200 border-t bg-white/90 backdrop-blur focus-within:border-structure-300",
              "transition-all",
              "rounded-2xl border-b border-l border-r border-element-500 focus-within:border-action-300 focus-within:shadow-md focus-within:ring-1",
              isAnimating ? "duration-600 animate-shake" : "duration-300"
            )}
          >
            <div className="relative flex w-full flex-1 flex-col">
              <InputBarCitations fileUploaderService={fileUploaderService} />

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
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
