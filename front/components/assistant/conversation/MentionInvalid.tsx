import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useDismissMention } from "@app/lib/swr/mentions";
import type {
  ConversationWithoutContentType,
  RichMentionWithStatus,
} from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  AlertCircle,
  Button,
  ContentMessage,
  Icon,
  XClose,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface MentionInvalidProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  mention: Extract<
    RichMentionWithStatus,
    {
      status: "user_restricted_by_conversation_access";
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

  const canCurrentUserRespond = useMemo(
    () =>
      canCurrentUserRespondToParentUserMessage({
        parentUserId: triggeringUser?.sId,
        currentUserId: user?.sId,
      }),
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

  if (!canCurrentUserRespond || mention.dismissed) {
    return null;
  }

  // Show warning message without approve/reject buttons
  // Different message for project conversations (non-editor can't add members)
  const isPodConv = isPodConversation(conversation);
  const warningMessage = isPodConv
    ? "is not a member of this Pod and only Pod editors can add new members."
    : "doesn't have access to this conversation's spaces and won't be able to view it nor be invited.";

  return (
    <ContentMessage variant="warning" className="my-3 w-full max-w-full">
      <div className="flex items-center gap-2">
        <Icon visual={AlertCircle} className="hidden sm:block" />
        <div>
          <span className="font-semibold">{mention.label}</span>{" "}
          {warningMessage}
        </div>
        <div className="ml-auto">
          <Button
            label="Dismiss"
            variant="outline"
            size="xs"
            icon={XClose}
            disabled={isSubmitting}
            onClick={handleDismiss}
          />
        </div>
      </div>
    </ContentMessage>
  );
}
