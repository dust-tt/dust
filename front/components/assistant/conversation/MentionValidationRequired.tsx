import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { isAgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useMentionValidation } from "@app/lib/swr/mentions";
import { useUserMemory } from "@app/lib/swr/user";
import type {
  ConversationWithoutContentType,
  RichMentionWithStatus,
} from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  ActionCardBlock,
  Avatar,
  Button,
  InfoCircle,
  MessageChatSquare,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
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
  const { hasFeature } = useFeatureFlags();
  const hasUserMemory = hasFeature("user_memory");
  const { isMemoryEnabled } = useUserMemory({
    owner,
    disabled: !hasUserMemory,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { validateMention } = useMentionValidation({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
    messageId: message.sId,
    isProjectConversation: mention.status === "pending_project_membership",
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

  const { status } = mention;

  let title: string;
  switch (status) {
    case "agent_restricted_by_space_usage":
      title = `Run ${mention.label} in this Pod conversation?`;
      break;
    case "pending_project_membership":
      title = `Add ${mention.label} to this Pod?`;
      break;
    case "pending_conversation_access":
      title = `Invite ${mention.label} to this conversation?`;
      break;
    default:
      assertNever(status);
  }

  let description: ReactNode;
  switch (status) {
    case "agent_restricted_by_space_usage":
      description = (
        <>
          <span className="font-semibold">{mention.label}</span> uses at least
          one private space. If you run it here, its outputs will be visible to
          Pod members who may not have access to those spaces.
        </>
      );
      break;
    case "pending_project_membership":
      description = isAgentMessageWithStreaming(message) ? (
        <>
          <span className="font-semibold">{message.configuration.name}</span>{" "}
          mentioned <span className="font-semibold">{mention.label}</span>. Do
          you want to add them to this Pod?
        </>
      ) : (
        "They'll have access to all Pod conversations."
      );
      break;
    case "pending_conversation_access":
      description = isAgentMessageWithStreaming(message) ? (
        <>
          <span className="font-semibold">{message.configuration.name}</span>{" "}
          mentioned <span className="font-semibold">{mention.label}</span>. Do
          you want to invite them? They'll see the full history and be able to
          reply.
        </>
      ) : (
        "They'll see the full history and be able to reply."
      );
      break;
    default:
      assertNever(status);
  }

  // Inviting someone to a conversation or adding them to a Pod shows the
  // conversation to other people, so we warn the inviter (if they have memory)
  // before they confirm
  const showMemoryWarning =
    hasUserMemory &&
    isMemoryEnabled &&
    (status === "pending_conversation_access" ||
      status === "pending_project_membership");

  let approveLabel: string;
  switch (status) {
    case "agent_restricted_by_space_usage":
      approveLabel = "Run agent";
      break;
    case "pending_project_membership":
      approveLabel = "Add to Pod";
      break;
    case "pending_conversation_access":
      approveLabel = "Invite";
      break;
    default:
      assertNever(status);
  }

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
        description={
          <>
            {description}
            {showMemoryWarning && (
              <span className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <InfoCircle className="h-4 w-4 shrink-0" />
                <span>
                  The content of your personal memory may be disclosed to
                  invited users.
                </span>
              </span>
            )}
          </>
        }
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
