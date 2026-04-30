import type { VirtuosoMessageListContext } from "@app/components/assistant/conversation/types";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { isAgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useMentionValidation } from "@app/lib/swr/mentions";
import type {
  ConversationWithoutContentType,
  RichMentionWithStatus,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  ActionCardBlock,
  Avatar,
  Button,
  ChatBubbleLeftRightIcon,
} from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { useEffect, useMemo, useState } from "react";

interface MentionValidationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  mention: Extract<
    RichMentionWithStatus,
    {
      status: "pending_conversation_access" | "pending_project_membership";
    }
  >;
  conversation: ConversationWithoutContentType;
  message: VirtuosoMessage;
}

export function MentionValidationRequired({
  triggeringUser,
  owner,
  mention,
  conversation,
  message,
}: MentionValidationRequiredProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isProjectMembership = mention.status === "pending_project_membership";

  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const { validateMention } = useMentionValidation({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
    messageId: message.sId,
    isProjectConversation: isProjectMembership,
  });

  const isTriggeredByCurrentUser = useMemo(
    () => !triggeringUser || triggeringUser.sId === user?.sId,
    [triggeringUser, user?.sId]
  );

  // Auto-scroll to make the validation card visible when it first appears.
  // The card is rendered below the message content, so without this the user
  // would have to manually scroll down to find it.
  useEffect(() => {
    if (!isTriggeredByCurrentUser) {
      return;
    }
    const currentData = methods.data.get();
    const messageIndex = currentData.findIndex((m) => m.sId === message.sId);
    if (messageIndex !== -1) {
      methods.scrollToItem({
        index: messageIndex,
        align: "end",
        behavior: "smooth",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await validateMention(mention, "rejected");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await validateMention(mention, "approved");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isTriggeredByCurrentUser) {
    return null;
  }

  const title = isProjectMembership
    ? `Add ${mention.label} to this project?`
    : `Invite ${mention.label} to this conversation?`;

  const description = isAgentMessageWithStreaming(message) ? (
    <>
      <span className="font-semibold">@{message.configuration.name}</span>{" "}
      mentioned <span className="font-semibold">{mention.label}</span>.
      {isProjectMembership
        ? " Do you want to add them to this project?"
        : " Do you want to invite them? They'll see the full history and be able to reply."}
    </>
  ) : isProjectMembership ? (
    "They'll have access to all project conversations."
  ) : (
    "They'll see the full history and be able to reply."
  );

  return (
    <div className="my-3">
      <ActionCardBlock
        title={title}
        visual={<Avatar icon={ChatBubbleLeftRightIcon} size="sm" />}
        description={description}
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              label="Decline"
              disabled={isSubmitting}
              onClick={handleReject}
            />
            <Button
              variant="highlight"
              size="sm"
              label={isProjectMembership ? "Add to project" : "Invite"}
              disabled={isSubmitting}
              isLoading={isSubmitting}
              onClick={handleApprove}
            />
          </div>
        }
      />
    </div>
  );
}
