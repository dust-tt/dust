import type {
  AgentMessagePublicType,
  ConversationMessageReactionsType,
  LightWorkspaceType,
  UserMessageType,
} from "@dust-tt/client";
import type { MessageWithContentFragmentsType } from "@extension/shared/lib/conversation";
import { useDustAPI } from "@extension/shared/lib/dust_api";
import type { AgentMessageFeedbackType } from "@extension/shared/lib/feedbacks";
import type { StoredUser } from "@extension/shared/services/auth";
import { AgentMessage } from "@extension/ui/components/conversation/AgentMessage";
import {
  AttachmentCitation,
  contentFragmentToAttachmentCitation,
} from "@extension/ui/components/conversation/AttachmentCitation";
import type { FeedbackSelectorBaseProps } from "@extension/ui/components/conversation/FeedbackSelector";
import { UserMessage } from "@extension/ui/components/conversation/UserMessage";
import { useSubmitFunction } from "@extension/ui/components/utils/useSubmitFunction";
import React from "react";
import { useSWRConfig } from "swr";

interface MessageItemProps {
  conversationId: string;
  hideReactions: boolean;
  isInModal: boolean;
  isLastMessage: boolean;
  message: MessageWithContentFragmentsType;
  userAndAgentMessages: (UserMessageType | AgentMessagePublicType)[];
  messageFeedback: AgentMessageFeedbackType | undefined;
  owner: LightWorkspaceType;
  reactions: ConversationMessageReactionsType;
  user: StoredUser;
}

const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    {
      conversationId,
      messageFeedback,
      isLastMessage,
      message,
      userAndAgentMessages,
      owner,
      user,
    }: MessageItemProps,
    ref
  ) {
    const { sId, type } = message;
    const dustAPI = useDustAPI();
    const { mutate } = useSWRConfig();
    const { submit: onSubmitThumb, isSubmitting: isSubmittingThumb } =
      useSubmitFunction(
        async ({
          thumb,
          shouldRemoveExistingFeedback,
          feedbackContent,
          isConversationShared,
        }: {
          thumb: string;
          shouldRemoveExistingFeedback: boolean;
          feedbackContent: string | null;
          isConversationShared: boolean;
        }) => {
          const res = shouldRemoveExistingFeedback
            ? await dustAPI.deleteFeedback(conversationId, message.sId)
            : await dustAPI.postFeedback(conversationId, message.sId, {
                thumbDirection: thumb,
                feedbackContent,
                isConversationShared,
              });
          if (res.isOk()) {
            await mutate([
              "getConversationFeedbacks",
              dustAPI.workspaceId(),
              { conversationId },
            ]);
          }
        }
      );

    if (message.visibility === "deleted") {
      return null;
    }

    const messageFeedbackWithSubmit: FeedbackSelectorBaseProps = {
      feedback: messageFeedback
        ? {
            thumb: messageFeedback.thumbDirection,
            feedbackContent: messageFeedback.content,
            isConversationShared: messageFeedback.isConversationShared,
          }
        : null,
      onSubmitThumb,
      isSubmittingThumb,
    };

    switch (type) {
      case "user_message":
        const citations = message.contenFragments
          ? message.contenFragments
              .map((contentFragment) => {
                const attachmentCitation =
                  contentFragmentToAttachmentCitation(contentFragment);

                return (
                  attachmentCitation && (
                    <AttachmentCitation
                      key={attachmentCitation.id}
                      attachmentCitation={attachmentCitation}
                    />
                  )
                );
              })
              .filter((x) => x !== null)
          : undefined;

        return (
          <div
            key={`message-id-${sId}`}
            ref={ref}
            className="mt-6 min-w-60 max-w-full md:mt-10"
          >
            <UserMessage
              citations={citations}
              conversationId={conversationId}
              isLastMessage={isLastMessage}
              message={message}
              owner={owner}
            />
          </div>
        );

      case "agent_message":
        return (
          <div key={`message-id-${sId}`} ref={ref} className="mt-6 md:mt-10">
            <AgentMessage
              conversationId={conversationId}
              isLastMessage={isLastMessage}
              message={message}
              userAndAgentMessages={userAndAgentMessages}
              messageFeedback={messageFeedbackWithSubmit}
              owner={owner}
              user={user}
            />
          </div>
        );

      default:
        console.error("Unknown message type", message);
    }
  }
);

export default MessageItem;
