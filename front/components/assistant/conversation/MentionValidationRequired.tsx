import {
  Button,
  CheckIcon,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { isMessageTemporayState } from "@app/components/assistant/conversation/types";
import { useMentionValidation } from "@app/lib/swr/mentions";
import { useUser } from "@app/lib/swr/user";
import type {
  LightWorkspaceType,
  RichMentionWithStatus,
  UserType,
} from "@app/types";

interface MentionValidationRequired {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  pendingMention: RichMentionWithStatus;
  conversationId: string;
  message: VirtuosoMessage;
}

export function MentionValidationRequired({
  triggeringUser,
  owner,
  pendingMention,
  conversationId,
  message,
}: MentionValidationRequired) {
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { validateMention } = useMentionValidation({
    workspaceId: owner.sId,
    conversationId,
    messageId: message.sId,
  });

  const isTriggeredByCurrentUser = useMemo(
    () => !triggeringUser || triggeringUser.sId === user?.sId,
    [triggeringUser, user?.sId]
  );

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      await validateMention(pendingMention, "rejected");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await validateMention(pendingMention, "approved");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isTriggeredByCurrentUser) {
    return null;
  }

  return (
    <ContentMessage variant="info" className="my-3 w-full max-w-full">
      <div className="flex items-center gap-2">
        <Icon visual={InformationCircleIcon} className="hidden sm:block" />
        <div className="text-xs sm:text-sm">
          {isMessageTemporayState(message) ? (
            <>
              <span className="font-semibold">
                @{message.configuration.name}
              </span>{" "}
              mentioned
              <span className="font-semibold">{pendingMention.label}</span> but
              they are not in this conversation. Do you want to invite them?
            </>
          ) : (
            <>
              You mentioned <b>{pendingMention.label}</b> but they are not in
              this conversation. Do you want to invite them?
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
            label="Yes"
            variant="highlight"
            size="xs"
            icon={CheckIcon}
            disabled={isSubmitting}
            onClick={handleApprove}
          />
        </div>
      </div>
    </ContentMessage>
  );
}
