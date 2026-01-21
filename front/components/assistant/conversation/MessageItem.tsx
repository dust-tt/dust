import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { contentFragmentToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import type { FeedbackSelectorBaseProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { MentionInvalid } from "@app/components/assistant/conversation/MentionInvalid";
import { MentionValidationRequired } from "@app/components/assistant/conversation/MentionValidationRequired";
import { MessageDateIndicator } from "@app/components/assistant/conversation/MessageDateIndicator";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  getMessageDate,
  isHiddenMessage,
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { ConfirmContext } from "@app/components/Confirm";
import useCustomEditor from "@app/components/editor/input_bar/useCustomEditor";
import { useDeleteMessage } from "@app/hooks/useDeleteMessage";
import { useEditUserMessage } from "@app/hooks/useEditUserMessage";
import { useMessageFeedback } from "@app/hooks/useMessageFeedback";
import { useReaction } from "@app/hooks/useReaction";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { useSubmitFunction } from "@app/lib/client/utils";
import { classNames } from "@app/lib/utils";
import type { RichMention, UserType } from "@app/types";

interface MessageItemProps {
  data: VirtuosoMessage;
  context: VirtuosoMessageListContext;
  index: number;
  nextData: VirtuosoMessage | null;
  prevData: VirtuosoMessage | null;
}

export const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    { data, context, prevData, nextData }: MessageItemProps,
    ref
  ) {
    const sId = data.sId;

    const methods = useVirtuosoMethods<
      VirtuosoMessage,
      VirtuosoMessageListContext
    >();

    const submitFeedback = useMessageFeedback({
      owner: context.owner,
      conversationId: context.conversation?.sId,
    });

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
          await submitFeedback({
            messageId: sId,
            thumbDirection: thumb,
            feedbackContent,
            isConversationShared,
            shouldRemoveExistingFeedback,
          });
        }
      );

    const { onReactionToggle } = useReaction({
      owner: context.owner,
      conversationId: context.conversation?.sId,
      message: data,
    });

    const { deleteMessage, isDeleting } = useDeleteMessage({
      owner: context.owner,
      conversationId: context.conversation?.sId || "",
    });

    const { editMessage, isEditing } = useEditUserMessage({
      owner: context.owner,
      conversationId: context.conversation?.sId || "",
    });

    const featureFlags = useFeatureFlags({ workspaceId: context.owner.sId });
    const reactionsEnabled =
      featureFlags.hasFeature("projects") && context.enableReactions;

    const confirm = useContext(ConfirmContext);

    const [shouldShowEditor, setShouldShowEditor] = useState(false);

    const handleSaveRef = useRef<(() => Promise<void>) | null>(null);

    const { editor, editorService } = useCustomEditor({
      owner: context.owner,
      conversationId: context.conversation?.sId || "",
      onEnterKeyDown: () => {
        handleSaveRef.current?.();
      },
      disableAutoFocus: false,
    });

    const handleSave = useCallback(async () => {
      if (!isUserMessage(data) || !context.conversation) {
        return;
      }

      const { markdown, mentions } = editorService.getMarkdownAndMentions();

      await editMessage({
        messageId: data.sId,
        content: markdown,
        mentions,
      });

      setShouldShowEditor(false);
    }, [data, context.conversation, editMessage, editorService]);

    handleSaveRef.current = handleSave;

    const messageFeedback = context.feedbacksByMessageId[sId];

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

    const citations =
      isUserMessage(data) && data.contentFragments.length > 0
        ? data.contentFragments.map((contentFragment, index) => {
          const attachmentCitation =
            contentFragmentToAttachmentCitation(contentFragment);

          return (
            <AttachmentCitation
              owner={context.owner}
              key={index}
              attachmentCitation={attachmentCitation}
              conversationId={context.conversation?.sId}
            />
          );
        })
        : undefined;

    const areSameDate =
      prevData &&
      getMessageDate(prevData).toDateString() ===
      getMessageDate(data).toDateString();

    const triggeringUser = useMemo((): UserType | null => {
      if (isMessageTemporayState(data)) {
        const parentMessageId = data.parentMessageId;
        const messages = methods.data.get();
        const parentUserMessage = messages
          .filter(isUserMessage)
          .find((m) => m.sId === parentMessageId);
        return parentUserMessage?.user ?? null;
      } else {
        return data.user;
      }
    }, [data, methods.data]);

    if (isHiddenMessage(data)) {
      // This is hacky but in case of handover we generate a user message from the agent and we want to hide it in the conversation
      // because it has no value to display.
      return null;
    }

    // No message without a conversation
    if (!context.conversation) {
      return null;
    }

    return (
      <>
        {!areSameDate && <MessageDateIndicator message={data} />}
        <div
          key={`message-id-${sId}`}
          ref={ref}
          className={classNames("mx-auto min-w-60", "mb-4", "max-w-4xl")}
        >
          {isUserMessage(data) && (
            <UserMessage
              citations={citations}
              conversationId={context.conversation.sId}
              enableExtendedActions={context.enableExtendedActions}
              currentUserId={context.user.sId}
              isLastMessage={!nextData}
              message={data}
              owner={context.owner}
              onReactionToggle={(emoji: string) => onReactionToggle({ emoji })}
              isEditing={isEditing}
              deleteMessage={deleteMessage}
              isDeleting={isDeleting}
              reactionsEnabled={reactionsEnabled}
              confirm={confirm}
              shouldShowEditor={shouldShowEditor}
              setShouldShowEditor={setShouldShowEditor}
              handleSave={handleSave}
              editor={editor}
              editorService={editorService}
            />
          )}
          {isMessageTemporayState(data) && (
            <AgentMessage
              user={context.user}
              triggeringUser={triggeringUser}
              conversationId={context.conversation.sId}
              isLastMessage={!nextData}
              agentMessage={data}
              messageFeedback={messageFeedbackWithSubmit}
              owner={context.owner}
              handleSubmit={context.handleSubmit}
              enableExtendedActions={context.enableExtendedActions}
            />
          )}
          {data.visibility !== "deleted" &&
            data.richMentions.map((mention) => {
              // To please the type checker
              if (!context.conversation) {
                return null;
              }

              if (mention.status === "pending") {
                return (
                  <MentionValidationRequired
                    key={mention.id}
                    mention={mention}
                    message={data}
                    owner={context.owner}
                    triggeringUser={triggeringUser}
                    conversation={context.conversation}
                  />
                );
              } else if (
                mention.status === "user_restricted_by_conversation_access" ||
                mention.status === "agent_restricted_by_space_usage"
              ) {
                return (
                  <MentionInvalid
                    key={mention.id}
                    mention={mention}
                    message={data}
                    owner={context.owner}
                    triggeringUser={triggeringUser}
                    conversationId={context.conversation.sId}
                  />
                );
              }
            })}
        </div>
      </>
    );
  }
);
