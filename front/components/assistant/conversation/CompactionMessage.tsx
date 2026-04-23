import { formatTimestring } from "@app/lib/utils/timestamps";
import type {
  CompactionMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  AnimatedText,
  ContentMessage,
  ExclamationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";

interface CompactionMessageProps {
  message: CompactionMessageType;
  conversation: ConversationWithoutContentType;
}

function getCompactionSuccessLabel(
  message: CompactionMessageType,
  conversation: ConversationWithoutContentType
): string {
  if (
    !message.sourceConversationId ||
    message.sourceConversationId === conversation.sId
  ) {
    return "Context compacted";
  }

  const parentConversation = conversation.forkingData?.forkedFrom;
  const isParentConversation =
    parentConversation?.parentConversationId === message.sourceConversationId;

  if (isParentConversation && parentConversation.parentConversationTitle) {
    return `Summary context gathered from conversation '${parentConversation.parentConversationTitle}'`;
  }

  return `Summary context gathered from conversation ${message.sourceConversationId}`;
}

export function CompactionMessage({
  message,
  conversation,
}: CompactionMessageProps) {
  switch (message.status) {
    case "failed":
      return (
        <ContentMessage
          title="Context compaction failed"
          variant="warning"
          className="flex flex-col gap-3"
          icon={ExclamationCircleIcon}
        >
          <div className="whitespace-normal break-words">
            You may experience reduced performance on very long conversations.
          </div>
        </ContentMessage>
      );
    case "succeeded":
      return (
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-sm text-muted-foreground">
            {getCompactionSuccessLabel(message, conversation)} ·{" "}
            {formatTimestring(message.created)}
          </span>
        </div>
      );
    case "created":
      return (
        <div className="flex items-center justify-center gap-1.5">
          <Spinner size="xs" />
          <AnimatedText variant="muted" className="text-sm">
            Compacting context…
          </AnimatedText>
        </div>
      );
    default:
      assertNeverAndIgnore(message.status);
      return null;
  }
}
