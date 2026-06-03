import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { isAgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
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
  MessageChatSquareV2,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

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

  const { validateMention } = useMentionValidation({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
    messageId: message.sId,
    isProjectConversation: isProjectMembership,
  });

  const canCurrentUserRespond = useMemo(
    () =>
      canCurrentUserRespondToParentUserMessage({
        parentUserId: triggeringUser?.sId,
        currentUserId: user?.sId,
      }),
    [triggeringUser, user?.sId]
  );

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

  if (!canCurrentUserRespond) {
    return null;
  }

  const title = isProjectMembership
    ? `Add ${mention.label} to this Pod?`
    : `Invite ${mention.label} to this conversation?`;

  const description = isAgentMessageWithStreaming(message) ? (
    <>
      <span className="font-semibold">@{message.configuration.name}</span>{" "}
      mentioned <span className="font-semibold">{mention.label}</span>.
      {isProjectMembership
        ? " Do you want to add them to this Pod?"
        : " Do you want to invite them? They'll see the full history and be able to reply."}
    </>
  ) : isProjectMembership ? (
    "They'll have access to all Pod conversations."
  ) : (
    "They'll see the full history and be able to reply."
  );

  return (
    <div className="my-3">
      <ActionCardBlock
        title={title}
        visual={<Avatar icon={MessageChatSquareV2} size="sm" />}
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
              label={isProjectMembership ? "Add to Pod" : "Invite"}
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
