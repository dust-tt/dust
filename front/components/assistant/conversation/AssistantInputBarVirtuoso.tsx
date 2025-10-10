import {
  ArrowDownDashIcon,
  ArrowPathIcon,
  Button,
  StopIcon,
} from "@dust-tt/sparkle";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import { isUserMessage } from "@app/components/assistant/conversation/types";
import { useCancelMessage, useConversation } from "@app/lib/swr/conversations";
import { emptyArray } from "@app/lib/swr/swr";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { AgentMention } from "@app/types";
import { isAgentMention } from "@app/types";

const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;

export const AssistantInputBarVirtuoso = ({
  context,
}: {
  context: VirtuosoMessageListContext;
}) => {
  const generationContext = useContext(GenerationContext);

  if (!generationContext) {
    throw new Error(
      "AssistantInputBarVirtuoso must be used within a GenerationContextProvider"
    );
  }

  const { mutateConversation } = useConversation({
    conversationId: context.conversationId,
    workspaceId: context.owner.sId,
    options: { disabled: true }, // We just want to get the mutation function
  });
  const cancelMessage = useCancelMessage({
    owner: context.owner,
    conversationId: context.conversationId,
  });

  const isGenerating = !!generationContext.generatingMessages.length;

  const isMobile = useIsMobile();
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const lastUserMessage = methods.data
    .get()
    .findLast(
      (m) =>
        isUserMessage(m) &&
        m.user?.id === context.user.id &&
        m.visibility !== "deleted" &&
        m.context.origin !== "agent_handover"
    );

  const agentMentions = useMemo(() => {
    return !lastUserMessage || !isUserMessage(lastUserMessage)
      ? emptyArray<AgentMention>()
      : lastUserMessage.mentions.filter(isAgentMention);
  }, [lastUserMessage]);

  const { bottomOffset } = useVirtuosoLocation();
  const distanceUntilButtonVisibe = 100;
  const showScrollToBottomButton = bottomOffset >= distanceUntilButtonVisibe;
  const showClearButton =
    context.agentBuilderContext?.resetConversation && !isGenerating;
  const showStopButton = generationContext.generatingMessages.some(
    (m) => m.conversationId === context.conversationId
  );

  const scrollToBottom = useCallback(() => {
    methods.scrollToItem({
      index: "LAST",
      align: "end",
      behavior:
        bottomOffset < MAX_DISTANCE_FOR_SMOOTH_SCROLL ? "smooth" : "instant",
    });
  }, [bottomOffset, methods]);

  const [isStopping, setIsStopping] = useState<boolean>(false);

  const getStopButtonLabel = () => {
    if (isStopping) {
      return "Stopping...";
    }
    const generatingCount = generationContext.generatingMessages.filter(
      (m) => m.conversationId === context.conversationId
    ).length;
    return generatingCount > 1 ? "Stop all" : "Stop";
  };

  const handleStopGeneration = async () => {
    if (!context.conversationId) {
      return;
    }
    setIsStopping(true); // we don't set it back to false immediately cause it takes a bit of time to cancel
    await cancelMessage(
      generationContext.generatingMessages
        .filter((m) => m.conversationId === context.conversationId)
        .map((m) => m.messageId)
    );
    void mutateConversation();
  };

  useEffect(() => {
    if (
      isStopping &&
      !generationContext.generatingMessages.some(
        (m) => m.conversationId === context.conversationId
      )
    ) {
      setIsStopping(false);
    }
  }, [
    isStopping,
    generationContext.generatingMessages,
    context.conversationId,
  ]);

  return (
    <div
      className={
        "max-h-dvh relative z-20 mx-auto flex w-full flex-col py-2 sm:w-full sm:max-w-3xl sm:py-4"
      }
    >
      <div
        className="flex w-full justify-center gap-2"
        style={{
          position: "absolute",
          top: "-2em",
        }}
      >
        {showScrollToBottomButton && (
          <Button
            icon={ArrowDownDashIcon}
            variant="outline"
            onClick={scrollToBottom}
          />
        )}

        {showClearButton && (
          <Button
            variant="outline"
            icon={ArrowPathIcon}
            onClick={context.agentBuilderContext?.resetConversation}
            label="Clear"
          />
        )}

        {showStopButton && (
          <Button
            variant="outline"
            label={getStopButtonLabel()}
            icon={StopIcon}
            onClick={handleStopGeneration}
            disabled={isStopping}
          />
        )}
      </div>
      <AssistantInputBar
        owner={context.owner}
        onSubmit={context.handleSubmit}
        stickyMentions={agentMentions}
        additionalAgentConfiguration={context.agentBuilderContext?.draftAgent}
        conversationId={context.conversationId}
        disableAutoFocus={isMobile}
        actions={context.agentBuilderContext?.actionsToShow}
        disable={context.agentBuilderContext?.isSavingDraftAgent}
      />
    </div>
  );
};
