import { ChatBubbleLeftRightIcon, RequestCard } from "@dust-tt/sparkle";
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
    <RequestCard
      className="my-3"
      icon={ChatBubbleLeftRightIcon}
      title={title}
      description={description}
      primaryAction={{
        label: isProjectMembership ? "Add to project" : "Invite",
        onClick: handleApprove,
        disabled: isSubmitting,
        isLoading: isSubmitting,
      }}
      secondaryAction={{
        label: "Decline",
        onClick: handleReject,
        disabled: isSubmitting,
      }}
    />
  );
}
