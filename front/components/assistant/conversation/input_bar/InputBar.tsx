import { Button, Citation, StopIcon } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import type { AgentMention, MentionType } from "@dust-tt/types";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import type { InputBarContainerProps } from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import InputBarContainer from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { compareAgentsForSort } from "@app/lib/assistant";
import { handleFileUploadToText } from "@app/lib/client/handle_file_upload";
import { useAgentConfigurations } from "@app/lib/swr";
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
 * @param tryModalAgentConfiguration when trying an assistant in a side modal we
 * need to pass the agent configuration to the input bar (it may not be in the
 * user's list of assistants)
 */
export function AssistantInputBar({
  owner,
  onSubmit,
  conversationId,
  stickyMentions,
  tryModalAgentConfiguration,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragment?: { title: string; content: string }
  ) => void;
  conversationId: string | null;
  stickyMentions?: AgentMention[];
  tryModalAgentConfiguration?: LightAgentConfigurationType;
}) {
  const { mutate } = useSWRConfig();

  const [contentFragmentBody, setContentFragmentBody] = useState<
    string | undefined
  >(undefined);
  const [contentFragmentFilename, setContentFragmentFilename] = useState<
    string | undefined
  >(undefined);
  const { agentConfigurations: baseAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: conversationId ? { conversationId } : "list",
    });

  const agentConfigurations = useMemo(() => {
    if (
      baseAgentConfigurations.find(
        (a) => a.sId === tryModalAgentConfiguration?.sId
      ) ||
      !tryModalAgentConfiguration
    ) {
      return baseAgentConfigurations;
    }
    return [...baseAgentConfigurations, tryModalAgentConfiguration];
  }, [baseAgentConfigurations, tryModalAgentConfiguration]);

  const sendNotification = useContext(SendNotificationsContext);

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
    if (isEmpty) {
      return;
    }

    const { mentions: rawMentions, text } = textAndMentions;
    const mentions: MentionType[] = rawMentions.map((m) => ({
      configurationId: m.id,
    }));

    let contentFragment:
      | {
          title: string;
          content: string;
          url: string | null;
          contentType: string;
        }
      | undefined = undefined;
    if (contentFragmentFilename && contentFragmentBody) {
      contentFragment = {
        title: contentFragmentFilename,
        content: contentFragmentBody,
        url: null,
        contentType: "file_attachment",
      };
    }
    onSubmit(text, mentions, contentFragment);
    resetEditorText();
    setContentFragmentFilename(undefined);
    setContentFragmentBody(undefined);
  };

  const onInputFileChange: InputBarContainerProps["onInputFileChange"] = async (
    event
  ) => {
    const file = (event?.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    if (file.size > 10_000_000) {
      sendNotification({
        type: "error",
        title: "File too large.",
        description:
          "PDF uploads are limited to 10Mb per file. Please consider uploading a smaller file.",
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
    if (res.value.content.length > 1_000_000) {
      // This error should pretty much never be triggered but it is a possible case, so here it is.
      sendNotification({
        type: "error",
        title: "File too large.",
        description:
          "The extracted text from your PDF has more than 1 million characters. This will overflow the assistant context. Please consider uploading a smaller file.",
      });
      return;
    }

    setContentFragmentFilename(res.value.title);
    setContentFragmentBody(res.value.content);
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
          messageIds: generationContext.generatingMessageIds,
        }),
      }
    );
    await mutate(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}`
    );
  };

  useEffect(() => {
    if (isProcessing && generationContext.generatingMessageIds.length === 0) {
      setIsProcessing(false);
    }
  }, [isProcessing, generationContext.generatingMessageIds.length]);

  const isInTryModal = !!tryModalAgentConfiguration;

  return (
    <>
      {generationContext.generatingMessageIds.length > 0 && (
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

      <div className="flex flex-1 px-0 sm:px-4">
        <div className="flex w-full flex-1 flex-col items-end self-stretch sm:flex-row">
          <div
            className={classNames(
              "relative flex w-full flex-1 flex-col items-stretch gap-0 self-stretch pl-4 sm:flex-row",
              "border-struture-200 border-t bg-white/80 shadow-[0_0_36px_-15px_rgba(0,0,0,0.3)] backdrop-blur focus-within:border-structure-300 sm:rounded-3xl sm:border-2 sm:border-element-500 sm:shadow-[0_12px_36px_-15px_rgba(0,0,0,0.3)] sm:focus-within:border-element-600",
              "transition-all duration-300",
              isAnimating ? "animate-shake" : ""
            )}
          >
            <div className="relative flex w-full flex-1 flex-col">
              {contentFragmentFilename && contentFragmentBody && (
                <div className="border-b border-structure-300/50 pb-3 pt-5">
                  <Citation
                    title={contentFragmentFilename}
                    description={contentFragmentBody?.substring(0, 100)}
                    onClose={() => {
                      setContentFragmentBody(undefined);
                      setContentFragmentFilename(undefined);
                    }}
                  />
                </div>
              )}

              <InputBarContainer
                hideQuickActions={isInTryModal}
                allAssistants={activeAgents}
                agentConfigurations={agentConfigurations}
                owner={owner}
                selectedAssistant={selectedAssistant}
                onEnterKeyDown={handleSubmit}
                stickyMentions={stickyMentions}
                onInputFileChange={onInputFileChange}
                disableAttachment={!!contentFragmentFilename}
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
  tryModalAgentConfiguration,
}: {
  owner: WorkspaceType;
  onSubmit: (
    input: string,
    mentions: MentionType[],
    contentFragment?: { title: string; content: string }
  ) => void;
  stickyMentions?: AgentMention[];
  conversationId: string | null;
  tryModalAgentConfiguration?: LightAgentConfigurationType;
}) {
  return (
    <div className="4xl:px-0 fixed bottom-0 left-0 right-0 z-20 flex-initial lg:left-80">
      <div className="mx-auto max-h-screen max-w-4xl pb-0 sm:pb-8">
        <AssistantInputBar
          owner={owner}
          onSubmit={onSubmit}
          conversationId={conversationId}
          stickyMentions={stickyMentions}
          tryModalAgentConfiguration={tryModalAgentConfiguration}
        />
      </div>
    </div>
  );
}
