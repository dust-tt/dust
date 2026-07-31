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
  MessageChatSquare,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

type ValidatableMention = Extract<
  RichMentionWithStatus,
  {
    status:
      | "pending_conversation_access"
      | "pending_project_membership"
      | "agent_restricted_by_space_usage";
  }
>;

interface MentionValidationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  mention: ValidatableMention;
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
  const isRestrictedAgent =
    mention.status === "agent_restricted_by_space_usage";

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

  if (!canCurrentUserRespond || mention.dismissed) {
    return null;
  }

  const title = isRestrictedAgent
    ? `Run ${mention.label} in this Pod conversation?`
    : isProjectMembership
      ? `Add ${mention.label} to this Pod?`
      : `Invite ${mention.label} to this conversation?`;

  const description = isRestrictedAgent ? (
    <>
      <span className="font-semibold">{mention.label}</span> uses at least one
      private space. If you run it here, its outputs will be visible to Pod
      members who may not have access to those spaces.
    </>
  ) : isAgentMessageWithStreaming(message) ? (
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

  const approveLabel = isRestrictedAgent
    ? "Run agent"
    : isProjectMembership
      ? "Add to Pod"
      : "Invite";

  const visual =
    mention.type === "agent" ? (
      <Avatar visual={mention.pictureUrl} size="sm" />
    ) : (
      <Avatar icon={MessageChatSquare} size="sm" />
    );

  return (
    <div className="my-3">
      <ActionCardBlock
        title={title}
        visual={visual}
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
              label={approveLabel}
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
