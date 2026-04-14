import { formatTimestring } from "@app/lib/utils/timestamps";
import type { CompactionMessageType } from "@app/types/assistant/conversation";
import { AnimatedText, Spinner } from "@dust-tt/sparkle";

interface CompactionMessageProps {
  message: CompactionMessageType;
}

export function CompactionMessage({ message }: CompactionMessageProps) {
  return (
    <div className="flex items-center justify-center gap-1.5">
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
