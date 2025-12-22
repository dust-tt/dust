import { Avatar, Button, CheckIcon, XMarkIcon } from "@dust-tt/sparkle";
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
    <div className="mx-auto flex w-80 min-w-[300px] flex-col rounded-xl bg-muted-background p-3 dark:bg-muted-background-night sm:min-w-[500px]">
      <div className="flex flex-row gap-3 text-foreground dark:text-foreground-night">
        <Avatar
          visual={pendingMention.pictureUrl}
          name={pendingMention.label}
          size="md"
        />

        <div className="-mt-1">
          {isMessageTemporayState(message) ? (
            <>
              <span className="font-semibold">{pendingMention.label}</span> has
              been mentioned by{" "}
              <span className="font-semibold">
                @{message.configuration.name}
              </span>
              . Do you want to let them know ?
            </>
          ) : (
            <>
              <b>{pendingMention.label}</b> has been mentioned. Do you want to
              let them know ?
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-row gap-3">
        <div className="flex-grow" />
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
  );
}
