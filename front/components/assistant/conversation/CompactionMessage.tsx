import { formatTimestring } from "@app/lib/utils/timestamps";
import type { CompactionMessageType } from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  AnimatedText,
  ContentMessage,
  ExclamationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";

interface CompactionMessageProps {
  message: CompactionMessageType;
}

export function CompactionMessage({ message }: CompactionMessageProps) {
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
          <span className="text-base text-muted-foreground">
            Context compacted · {formatTimestring(message.created)}
          </span>
        </div>
      );
    case "created":
      return (
        <div className="flex items-center justify-center gap-1.5">
          <Spinner size="xs" />
          <AnimatedText variant="muted" className="text-base">
            Compacting context…
          </AnimatedText>
        </div>
      );
    default:
      assertNeverAndIgnore(message.status);
      return null;
  }
}
