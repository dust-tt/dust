import {
  ActionCardBlock,
  Avatar,
  Button,
  ChatBubbleLeftRightIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { isMessageTemporayState } from "@app/components/assistant/conversation/types";
import { useMentionValidation } from "@app/lib/swr/mentions";
import { useUser } from "@app/lib/swr/user";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
  RichMentionWithStatus,
  UserType,
} from "@app/types";

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
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isProjectMembership = mention.status === "pending_project_membership";

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

  const description = isMessageTemporayState(message) ? (
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
