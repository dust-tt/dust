import type {
  ConversationMessageReactionsType,
  LightWorkspaceType,
} from "@dust-tt/client";
import {
  Avatar,
  Citation,
  CitationIcons,
  CitationImage,
  CitationTitle,
  DocumentTextIcon,
  Icon,
  SlackLogo,
} from "@dust-tt/sparkle";
import { AgentMessage } from "@extension/components/conversation/AgentMessage";
import type { FeedbackSelectorProps } from "@extension/components/conversation/FeedbackSelector";
import { UserMessage } from "@extension/components/conversation/UserMessage";
import { useSubmitFunction } from "@extension/components/utils/useSubmitFunction";
import type { MessageWithContentFragmentsType } from "@extension/lib/conversation";
import { useDustAPI } from "@extension/lib/dust_api";
import type { AgentMessageFeedbackType } from "@extension/lib/feedbacks";
import type { StoredUser } from "@extension/lib/storage";
import React from "react";
import { useSWRConfig } from "swr";

interface MessageItemProps {
  conversationId: string;
  messageFeedback: AgentMessageFeedbackType | undefined;
  hideReactions: boolean;
  isInModal: boolean;
  isLastMessage: boolean;
  message: MessageWithContentFragmentsType;
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

    const messageFeedbackWithSubmit: FeedbackSelectorProps = {
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
          ? message.contenFragments.map((contentFragment) => {
              const citationType = ["dust-application/slack"].includes(
                contentFragment.contentType
              )
                ? "slack"
                : "document";

              const icon =
                citationType === "slack" ? SlackLogo : DocumentTextIcon;

              return (
                <Citation
                  key={contentFragment.sId}
                  href={contentFragment.sourceUrl ?? undefined}
                >
                  <div className="flex gap-2">
                    {contentFragment.context.profilePictureUrl && (
                      <CitationIcons>
                        <Avatar
                          visual={contentFragment.context.profilePictureUrl}
                          size="xs"
                        />
                      </CitationIcons>
                    )}
                    {contentFragment.sourceUrl ? (
                      <>
                        <CitationImage imgSrc={contentFragment.sourceUrl} />
                        <CitationIcons>
                          <Icon visual={icon} />
                        </CitationIcons>
                      </>
                    ) : (
                      <CitationIcons>
                        <Icon visual={icon} />
                      </CitationIcons>
                    )}
                  </div>
                  <CitationTitle>{contentFragment.title}</CitationTitle>
                </Citation>
              );
            })
          : undefined;

        return (
          <div key={`message-id-${sId}`} ref={ref}>
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
          <div key={`message-id-${sId}`} ref={ref}>
            <AgentMessage
              conversationId={conversationId}
              isLastMessage={isLastMessage}
              message={message}
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
