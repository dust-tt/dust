import type { AttachSelectionMessage } from "@app/platforms/chrome/messages";
import { usePlatform } from "@app/shared/context/PlatformContext";
import { useDustAPI } from "@app/shared/lib/dust_api";
import { getSpaceIcon } from "@app/shared/lib/spaces";
import type { ContentFragmentsType } from "@app/shared/lib/types";
import {
  classNames,
  compareAgentsForSort,
  isEqualNode,
} from "@app/shared/lib/utils";
import { usePublicAgentConfigurations } from "@app/ui/components/assistants/usePublicAgentConfigurations";
import { useFileDrop } from "@app/ui/components/conversation/FileUploaderContext";
import { GenerationContext } from "@app/ui/components/conversation/GenerationContextProvider";
import { InputBarAttachments } from "@app/ui/components/input_bar/InputBarAttachment";
import type { InputBarContainerProps } from "@app/ui/components/input_bar/InputBarContainer";
import { InputBarContainer } from "@app/ui/components/input_bar/InputBarContainer";
import { InputBarContext } from "@app/ui/components/input_bar/InputBarContext";
import { useFileUploaderService } from "@app/ui/hooks/useFileUploaderService";
import { useSpaces } from "@app/ui/hooks/useSpaces";
import type {
  AgentMentionType,
  ConversationPublicType,
  DataSourceViewContentNodeType,
  ExtensionWorkspaceType,
  LightAgentConfigurationType,
} from "@dust-tt/client";
import { Button, Page, Spinner, StopIcon } from "@dust-tt/sparkle";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
    contentFragments: ContentFragmentsType
  ) => void;
  stickyMentions?: AgentMentionType[];
  additionalAgentConfiguration?: LightAgentConfigurationType;
  disableAutoFocus?: boolean;
  conversation?: ConversationPublicType;
  isTabIncluded: boolean;
  setIncludeTab: (includeTab: boolean) => void;
  isSubmitting?: boolean;
}) {
  const platform = usePlatform();
  const dustAPI = useDustAPI();

  const { agentConfigurations: baseAgentConfigurations } =
    usePublicAgentConfigurations();

  const [attachedNodes, setAttachedNodes] = useState<
    DataSourceViewContentNodeType[]
  >([]);

  const { spaces } = useSpaces();

  const spacesMap = useMemo(
    () =>
      Object.fromEntries(
        spaces?.map((space) => [
          space.sId,
          {
            name: space.kind === "global" ? "Company Data" : space.name,
            icon: getSpaceIcon(space),
          },
        ]) || []
      ),
    [spaces]
  );

  const fileUploaderService = useFileUploaderService(
    platform.capture,
    conversation?.sId
  );
  const {
    isCapturing,
    isProcessingFiles,
    uploadContentTab,
    handleFilesUpload,
    getFileBlobs,
    resetUpload,
  } = fileUploaderService;

  const sendInputBarStatus = useCallback(
    (available: boolean) => {
      void platform.messaging?.sendMessage({
        type: "INPUT_BAR_STATUS",
        available,
      });
    },
    [platform.messaging]
  );

  useEffect(() => {
    void sendInputBarStatus(true);

    const cleanup = platform.messaging?.addMessageListener(
      async (message: AttachSelectionMessage) => {
        const { type } = message;
        if (type === "EXT_ATTACH_TAB") {
          void uploadContentTab(message);
        }
      }
    );

    return () => {
      void sendInputBarStatus(false);
      cleanup?.();
    };
  }, [platform.messaging, uploadContentTab]);

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

  const handleNodesAttachmentSelect = (node: DataSourceViewContentNodeType) => {
    const isNodeAlreadyAttached = attachedNodes.some((attachedNode) =>
      isEqualNode(attachedNode, node)
    );
    if (!isNodeAlreadyAttached) {
      setAttachedNodes((prev) => [...prev, node]);
    }
  };

  const handleNodesAttachmentRemove = (node: DataSourceViewContentNodeType) => {
    setAttachedNodes((prev) => prev.filter((n) => !isEqualNode(n, node)));
  };

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
    markdownAndMentions,
    resetEditorText,
    setLoading
  ) => {
    if (isCapturing || isProcessingFiles) {
      return;
    }

    if (isEmpty) {
      return;
    }
    const { mentions: rawMentions, markdown } = markdownAndMentions;
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

    void onSubmit(markdown, mentions, {
      uploaded: newFiles,
      contentNodes: attachedNodes,
    });
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
        <div className="absolute inset-0 z-50 overflow-hidden">
          <div
            className={classNames(
              "fixed flex inset-0 backdrop-blur-sm transition-opacity",
              "bg-muted-background/80 dark:bg-muted-background-night/80"
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
              "p-2",
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch pl-3 sm:flex-row",
              "rounded-3xl transition-all",
              "bg-muted-background dark:bg-muted-background-night",
              "border",
              "border-border-dark dark:border-border-dark/10",
              "sm:border-border-dark/50 sm:focus-within:border-border-dark",
              "dark:focus-within:border-border-dark-night sm:focus-within:border-border-dark",
              "focus-within:ring-1 dark:focus-within:ring-1",
              "dark:focus-within:ring-highlight/30-night focus-within:ring-highlight/30",
              "sm:focus-within:ring-2 dark:sm:focus-within:ring-2",
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
                onNodeSelect={handleNodesAttachmentSelect}
                onNodeUnselect={handleNodesAttachmentRemove}
                attachedNodes={attachedNodes}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
