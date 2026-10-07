import {
  getCompactionInProgressLabel,
  getCompactionSuccessLabel,
} from "@app/components/assistant/conversation/utils";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type {
  CompactionMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  AlertCircle,
  AnimatedText,
  ContentMessage,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface CompactionMessageProps {
  message: CompactionMessageType;
  conversation: ConversationWithoutContentType;
}

export function CompactionMessage({
  message,
  conversation,
}: CompactionMessageProps) {
  const { t } = useLingui();

  switch (message.status) {
    case "failed":
      return (
        <ContentMessage
          title={t`Context compaction failed`}
          variant="warning"
          className="flex flex-col gap-3"
          icon={AlertCircle}
        >
          <div className="whitespace-normal break-words">
            <Trans>
              You may experience reduced performance on very long conversations.
            </Trans>
          </div>
        </ContentMessage>
      );
    case "succeeded":
      return (
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-sm text-muted-foreground">
            {getCompactionSuccessLabel(message, conversation, t)} ·{" "}
            {formatTimestring(message.created)}
          </span>
        </div>
      );
    case "created": {
      const label = getCompactionInProgressLabel(message, conversation, t);

      return (
        <div className="flex items-center justify-center gap-1.5">
          <Spinner size="xs" />
          <AnimatedText variant="muted" className="text-sm">
            {label}
          </AnimatedText>
        </div>
      );
    }
    default:
      assertNeverAndIgnore(message.status);
      return null;
  }
}
