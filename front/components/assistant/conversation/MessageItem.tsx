import {
  Citation,
  CitationDescription,
  CitationIcons,
  CitationImage,
  CitationTitle,
  DocumentIcon,
  FolderIcon,
  Icon,
  ImageIcon,
  SlackLogo,
  TableIcon,
  Tooltip,
  useSendNotification,
} from "@dust-tt/sparkle";
import React from "react";
import { useSWRConfig } from "swr";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { useSubmitFunction } from "@app/lib/client/utils";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import type {
  ConnectorProvider,
  MessageWithContentFragmentsType,
  UserType,
  WorkspaceType,
} from "@app/types";

interface MessageItemProps {
  conversationId: string;
  messageFeedback: AgentMessageFeedbackType | undefined;
  isInModal: boolean;
  isLastMessage: boolean;
  message: MessageWithContentFragmentsType;
  owner: WorkspaceType;
  user: UserType;
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
    const sendNotification = useSendNotification();

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
          const res = await fetch(
            `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/feedbacks`,
            {
              method: shouldRemoveExistingFeedback ? "DELETE" : "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                thumbDirection: thumb,
                feedbackContent,
                isConversationShared,
              }),
            }
          );
          if (res.ok) {
            if (feedbackContent && !shouldRemoveExistingFeedback) {
              sendNotification({
                title: "Feedback submitted",
                description:
                  "Your comment has been submitted successfully to the Builder of this agent. Thank you!",
                type: "success",
              });
            }
            await mutate(
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/feedbacks`
            );
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
              let visual;
              if (contentFragment.contentNodeData) {
                const { provider, nodeType } = contentFragment.contentNodeData;
                const logo = getConnectorProviderLogoWithFallback({
                  provider,
                });

                // For websites or folders, show just the provider logo
                const isWebsiteOrFolder =
                  provider === "webcrawler" || provider === null;
                if (isWebsiteOrFolder) {
                  visual = <Icon visual={logo} size="sm" />;
                } else {
                  // For other types, show both node type icon and provider logo
                  const nodeIcon =
                    nodeType === "table"
                      ? TableIcon
                      : nodeType === "folder"
                        ? FolderIcon
                        : DocumentIcon;

                  visual = (
                    <>
                      <Icon visual={nodeIcon} className="h-5 w-5" />
                      <Icon visual={logo} size="sm" />
                    </>
                  );
                }
              } else {
                // For file attachments
                const isImageType =
                  contentFragment.contentType.startsWith("image/");
                visual = (
                  <Icon visual={isImageType ? ImageIcon : DocumentIcon} />
                );

                if (
                  [
                    "dust-application/slack",
                    "text/vnd.dust.attachment.slack.thread",
                  ].includes(contentFragment.contentType)
                ) {
                  visual = <Icon visual={SlackLogo} />;
                }
              }

              const tooltipContent = contentFragment.contentNodeData ? (
                <div className="flex flex-col gap-1">
                  <div className="font-bold">{contentFragment.title}</div>
                  <div className="flex gap-1 pt-1 text-sm">
                    <Icon visual={FolderIcon} />
                    <p>{contentFragment.contentNodeData.spaceName}</p>
                  </div>
                  <div className="text-sm text-element-600">
                    {contentFragment.sourceUrl || ""}
                  </div>
                </div>
              ) : (
                contentFragment.title
              );

              return (
                <Tooltip
                  key={contentFragment.sId}
                  tooltipTriggerAsChild
                  trigger={
                    <Citation
                      className="w-40"
                      href={contentFragment.sourceUrl ?? undefined}
                    >
                      {contentFragment.sourceUrl &&
                        !contentFragment.contentNodeData && (
                          <CitationImage imgSrc={contentFragment.sourceUrl} />
                        )}

                      <CitationIcons>{visual}</CitationIcons>

                      <CitationTitle className="truncate text-ellipsis">
                        {contentFragment.title}
                      </CitationTitle>

                      {contentFragment.contentNodeData && (
                        <CitationDescription className="truncate text-ellipsis">
                          <div className="flex items-center gap-1">
                            <span>
                              {contentFragment.contentNodeData.spaceName}
                            </span>
                          </div>
                        </CitationDescription>
                      )}
                    </Citation>
                  }
                  label={tooltipContent}
                />
              );
            })
          : undefined;

        return (
          <div
            key={`message-id-${sId}`}
            ref={ref}
            className="w-fit min-w-60 max-w-full"
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
          <div key={`message-id-${sId}`} ref={ref} className="w-full">
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
