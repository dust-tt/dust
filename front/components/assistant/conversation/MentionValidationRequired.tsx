import {
  Button,
  CheckIcon,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  PlusIcon,
  XMarkIcon,
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
      // "pending" is deprecated but kept for migration compatibility
      status:
        | "pending"
        | "pending_conversation_access"
        | "pending_project_membership";
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

  return (
    <ContentMessage variant="info" className="my-3 w-full max-w-full">
      <div className="flex flex-col items-center gap-2 sm:flex-row">
        <Icon visual={InformationCircleIcon} className="hidden sm:block" />
        <div>
          {isMessageTemporayState(message) ? (
            <>
              <span className="font-semibold">
                @{message.configuration.name}
              </span>{" "}
              mentioned <span className="font-semibold">{mention.label}</span>.
              {isProjectMembership ? (
                <> Do you want to add them to this project?</>
              ) : (
                <>
                  {" "}
                  Do you want to invite them? They'll see the full history and
                  be able to reply.
                </>
              )}
            </>
          ) : (
            <>
              {isProjectMembership ? (
                <>
                  Add <b>{mention.label}</b> to this project? They'll have
                  access to all project conversations.
                </>
              ) : (
                <>
                  Invite <b>{mention.label}</b> to this conversation? They'll
                  see the full history and be able to reply.
                </>
              )}
            </>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            label="No"
            variant="outline"
            size="xs"
            icon={XMarkIcon}
            disabled={isSubmitting}
            onClick={handleReject}
          />
          <Button
            label={isProjectMembership ? "Add to project" : "Yes"}
            variant="highlight"
            size="xs"
            icon={isProjectMembership ? PlusIcon : CheckIcon}
            disabled={isSubmitting}
            onClick={handleApprove}
          />
        </div>
      </div>
    </ContentMessage>
  );
}
