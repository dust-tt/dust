import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { isAgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useMentionValidation } from "@app/lib/swr/mentions";
import { useUserMemory } from "@app/lib/swr/user";
import type {
  ConversationWithoutContentType,
  RichMentionRequiringValidation,
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
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

interface MentionValidationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  mention: RichMentionRequiringValidation;
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
  const { t } = useLingui();
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
  const mentionLabel = mention.label;

  let title: string;
  switch (status) {
    case "agent_restricted_by_space_usage":
      title = t`Run ${mentionLabel} in this Pod conversation?`;
      break;
    case "pending_project_membership":
      title = t`Add ${mentionLabel} to this Pod?`;
      break;
    case "pending_conversation_access":
      title = t`Invite ${mentionLabel} to this conversation?`;
      break;
    default:
      assertNever(status);
  }

  let description: ReactNode;
  switch (status) {
    case "agent_restricted_by_space_usage":
      description = (
        <Trans>
          <span className="font-semibold">{mentionLabel}</span> uses at least
          one private space. If you run it here, its outputs will be visible to
          Pod members who may not have access to those spaces.
        </Trans>
      );
      break;
    case "pending_project_membership":
      if (isAgentMessageWithStreaming(message)) {
        const agentName = message.configuration.name;
        description = (
          <Trans>
            <span className="font-semibold">{agentName}</span> mentioned{" "}
            <span className="font-semibold">{mentionLabel}</span>. Do you want
            to add them to this Pod?
          </Trans>
        );
      } else {
        description = t`They'll have access to all Pod conversations.`;
      }
      break;
    case "pending_conversation_access":
      if (isAgentMessageWithStreaming(message)) {
        const agentName = message.configuration.name;
        description = (
          <Trans>
            <span className="font-semibold">{agentName}</span> mentioned{" "}
            <span className="font-semibold">{mentionLabel}</span>. Do you want
            to invite them? They'll see the full history and be able to reply.
          </Trans>
        );
      } else {
        description = t`They'll see the full history and be able to reply.`;
      }
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
      approveLabel = t`Run agent`;
      break;
    case "pending_project_membership":
      approveLabel = t`Add to Pod`;
      break;
    case "pending_conversation_access":
      approveLabel = t({ message: "Invite", context: "button label" });
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
                  <Trans>
                    The content of your personal memory may be disclosed to
                    invited users.
                  </Trans>
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
              label={t`Decline`}
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
