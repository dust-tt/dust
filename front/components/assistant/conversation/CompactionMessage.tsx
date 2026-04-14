import type { CompactionVirtuosoMessage } from "@app/components/assistant/conversation/types";
import { formatTimestring } from "@app/lib/utils/timestamps";
import { AnimatedText, Spinner } from "@dust-tt/sparkle";

interface CompactionMessageProps {
  message: CompactionVirtuosoMessage;
}

export function CompactionMessage({ message }: CompactionMessageProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      {message.status === "succeeded" && (
        <span className="text-base text-muted-foreground">
          Context compacted · {formatTimestring(message.created)}
        </span>
      )}
      {message.status === "created" && (
        <>
          <Spinner size="xs" />
          <AnimatedText variant="muted" className="text-base">
            Compacting context…
          </AnimatedText>
        </>
      )}
    </div>
  );
}
