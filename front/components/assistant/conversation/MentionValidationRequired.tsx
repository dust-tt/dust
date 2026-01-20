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
import {
  isMessageTemporayState,
  isProjectConversation,
} from "@app/components/assistant/conversation/types";
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
      status: "pending";
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
  const { validateMention } = useMentionValidation({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
    messageId: message.sId,
  });

  const isProject = isProjectConversation(conversation);

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

  const handleApproveAndAddToProject = async () => {
    setIsSubmitting(true);
    try {
      await validateMention(mention, "approved_and_add_to_project");
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
              {isProject ? (
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
              {isProject ? (
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
          {isProject ? (
            <Button
              label="Add to project"
              variant="highlight"
              size="xs"
              icon={PlusIcon}
              disabled={isSubmitting}
              onClick={handleApproveAndAddToProject}
            />
          ) : (
            <Button
              label="Yes"
              variant="highlight"
              size="xs"
              icon={CheckIcon}
              disabled={isSubmitting}
              onClick={handleApprove}
            />
          )}
        </div>
      </div>
    </ContentMessage>
  );
}
