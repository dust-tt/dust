import { Button, Citation, StopIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSWRConfig } from "swr";

import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import InputBarContainer from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { ContentFragmentInput } from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { compareAgentsForSort } from "@app/lib/assistant";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { useAgentConfigurations } from "@app/lib/swr";
import { ClientSideTracking } from "@app/lib/tracking/client";
import { classNames } from "@app/lib/utils";

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
  hideQuickActions,
  disableAutoFocus = false,
  isFloating = true,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentInput[]
  ) => void;
  conversationId: string | null;
  stickyMentions?: AgentMention[];
  additionalAgentConfiguration?: LightAgentConfigurationType;
  hideQuickActions: boolean;
  disableAutoFocus: boolean;
  isFloating?: boolean;
}) {
  const { mutate } = useSWRConfig();

  const [contentFragmentData, setContentFragmentData] = useState<
    { title: string; content: string; file: File }[]
  >([]);

  const { agentConfigurations: baseAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: conversationId ? { conversationId } : "list",
    });

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

  const sendNotification = useContext(SendNotificationsContext);

  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const { animate, selectedAssistant } = useContext(InputBarContext);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isProcessingContentFragment, setIsProcessingContentFragment] =
    useState(false);

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
    if (isEmpty) {
      return;
    }

    const { mentions: rawMentions, text } = textAndMentions;
    const mentions: MentionType[] = rawMentions.map((m) => ({
      configurationId: m.id,
    }));
    if (contentFragmentData.length > 0) {
      void ClientSideTracking.trackInputBarFileUploadUsed({
        fileCount: contentFragmentData.length,
      });
    }

    onSubmit(
      text,
      mentions,
      contentFragmentData.map((cf) => {
        return {
          title: cf.title,
          content: cf.content,
          file: cf.file,
        };
      })
    );
    resetEditorText();
    setContentFragmentData([]);
  };

  const onInputFileChange: InputBarContainerProps["onInputFileChange"] =
    useCallback(
      async (event) => {
        setIsProcessingContentFragment(true);
        try {
          let totalSize = 0;
          for (const file of (event?.target as HTMLInputElement)?.files || []) {
            if (!file) {
              return;
            }
            if (file.size > 100_000_000) {
              // Even though we don't display the file size limit in the UI, we still check it here to prevent
              // processing files that are too large.
              sendNotification({
                type: "error",
                title: "File too large.",
                description:
                  "PDF uploads are limited to 100Mb per file. Please consider uploading a smaller file.",
              });
              return;
            }
            const res = await handleFileUploadToText(file);

            if (res.isErr()) {
              sendNotification({
                type: "error",
                title: "Error uploading file.",
                description: res.error.message,
              });
              return;
            }
            if (res.value.content.length > 500_000) {
              // This error should pretty much never be triggered but it is a possible case, so here it is.
              sendNotification({
                type: "error",
                title: "File too large.",
                description:
                  "The extracted text from your file has more than 500,000 characters. This will overflow the assistant context. Please consider uploading a smaller file.",
              });
              return;
            }
            totalSize += res.value.content.length;
            setContentFragmentData((prev) => {
              return prev.concat([
                {
                  title: res.value.title,
                  content: res.value.content,
                  file,
                },
              ]);
            });
          }
          // now we check for the total size of the content fragments
          if (totalSize > 500_000) {
            sendNotification({
              type: "error",
              title: "Files too large.",
              description:
                "The combined extracted text from the files you selected results in more than 500,000 characters. This will overflow the assistant context. Please consider uploading a smaller file.",
            });
          }
        } finally {
          setIsProcessingContentFragment(false);
        }
      },
      [sendNotification]
    );

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
    <>
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
        className={classNames("flex flex-1 px-0", isFloating ? "sm:px-4" : "")}
      >
        <div className="flex w-full flex-1 flex-col items-end self-stretch sm:flex-row">
          <div
            className={classNames(
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch pl-4 sm:flex-row",
              "border-struture-200 border-t bg-white/90 backdrop-blur focus-within:border-structure-300",
              "transition-all duration-300",
              isFloating
                ? "sm:rounded-3xl sm:border-b sm:border-l sm:border-r sm:border-element-500 sm:focus-within:border-action-300 sm:focus-within:shadow-md sm:focus-within:ring-1"
                : "",
              isAnimating ? "animate-shake" : ""
            )}
          >
            <div className="relative flex w-full flex-1 flex-col ">
              {contentFragmentData.length > 0 && (
                <div className="mr-4 flex gap-2 overflow-auto border-b border-structure-300/50 pb-3 pt-4">
                  {contentFragmentData.map((cf, i) => (
                    <Citation
                      key={`cf-${i}`}
                      title={cf.title}
                      size="xs"
                      description={cf.content?.substring(0, 100)}
                      onClose={() => {
                        setContentFragmentData((prev) => {
                          return prev.filter((_, index) => index !== i);
                        });
                      }}
                    />
                  ))}
                </div>
              )}

              <InputBarContainer
                hideQuickActions={hideQuickActions}
                disableAutoFocus={disableAutoFocus}
                allAssistants={activeAgents}
                agentConfigurations={agentConfigurations}
                owner={owner}
                selectedAssistant={selectedAssistant}
                onEnterKeyDown={handleSubmit}
                stickyMentions={stickyMentions}
                onInputFileChange={onInputFileChange}
                disableSendButton={isProcessingContentFragment}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function FixedAssistantInputBar({
  owner,
  onSubmit,
  stickyMentions,
  conversationId,
  additionalAgentConfiguration,
  hideQuickActions = false,
  disableAutoFocus = false,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragments: ContentFragmentInput[]
  ) => void;
  stickyMentions?: AgentMention[];
  conversationId: string | null;
  additionalAgentConfiguration?: LightAgentConfigurationType;
  hideQuickActions?: boolean;
  disableAutoFocus?: boolean;
}) {
  return (
    <div className="4xl:px-0 fixed bottom-0 z-20 w-full flex-initial">
      <div className="max-h-screen max-w-4xl pb-0 sm:pb-8">
        <AssistantInputBar
          owner={owner}
          onSubmit={onSubmit}
          conversationId={conversationId}
          stickyMentions={stickyMentions}
          additionalAgentConfiguration={additionalAgentConfiguration}
          hideQuickActions={hideQuickActions}
          disableAutoFocus={disableAutoFocus}
        />
      </div>
    </div>
  );
}
