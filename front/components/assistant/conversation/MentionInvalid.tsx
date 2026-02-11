import {
  Button,
  ContentMessage,
  ExclamationCircleIcon,
  Icon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useDismissMention } from "@app/lib/swr/mentions";
import type {
  ConversationWithoutContentType,
  RichMentionWithStatus,
} from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { LightWorkspaceType, UserType } from "@app/types/user";

interface MentionInvalidProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  mention: Extract<
    RichMentionWithStatus,
    {
      status:
        | "user_restricted_by_conversation_access"
        | "agent_restricted_by_space_usage";
    }
  >;
  conversation: ConversationWithoutContentType;
  message: VirtuosoMessage;
}

export function MentionInvalid({
  triggeringUser,
  mention,
  owner,
  conversation,
  message,
}: MentionInvalidProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { dismissMention } = useDismissMention({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
    messageId: message.sId,
  });

  const isTriggeredByCurrentUser = useMemo(
    () => !triggeringUser || triggeringUser.sId === user?.sId,
    [triggeringUser, user?.sId]
  );

  const handleDismiss = async () => {
    setIsSubmitting(true);
    try {
      await dismissMention(mention);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isTriggeredByCurrentUser || mention.dismissed) {
    return null;
  }

  switch (mention.status) {
    case "user_restricted_by_conversation_access": {
      // Show warning message without approve/reject buttons
      // Different message for project conversations (non-editor can't add members)
      const isProjectConv = isProjectConversation(conversation);
      const message = isProjectConv
        ? "is not a member of this project and only project editors can add new members."
        : "doesn't have access to this conversation's spaces and won't be able to view it nor be invited.";

      return (
        <ContentMessage variant="warning" className="my-3 w-full max-w-full">
          <div className="flex items-center gap-2">
            <Icon visual={ExclamationCircleIcon} className="hidden sm:block" />
            <div>
              <span className="font-semibold">{mention.label}</span> {message}
            </div>
            <div className="ml-auto">
              <Button
                label="Dismiss"
                variant="outline"
                size="xs"
                icon={XMarkIcon}
                disabled={isSubmitting}
                onClick={handleDismiss}
              />
            </div>
          </div>
        </ContentMessage>
      );
      break;
    }
    case "agent_restricted_by_space_usage": {
      return (
        <ContentMessage variant="warning" className="my-3 w-full max-w-full">
          <div className="flex items-center gap-2">
            <Icon visual={ExclamationCircleIcon} className="hidden sm:block" />
            <div>
              <span className="font-semibold">{mention.label}</span> can't be
              invoked as it is configured to use at least one space that the
              conversation cannot use. Projects conversations cannot use private
              spaces.
            </div>
            <div className="ml-auto">
              <Button
                label="Dismiss"
                variant="outline"
                size="xs"
                icon={XMarkIcon}
                disabled={isSubmitting}
                onClick={handleDismiss}
              />
            </div>
          </div>
        </ContentMessage>
      );
      break;
    }
  }
}
