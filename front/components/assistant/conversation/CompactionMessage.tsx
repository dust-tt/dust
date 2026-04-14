import type { CompactionVirtuosoMessage } from "@app/components/assistant/conversation/types";
import { AnimatedText, Spinner } from "@dust-tt/sparkle";

interface CompactionMessageProps {
  message: CompactionVirtuosoMessage;
}

function formatCompactionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function CompactionMessage({ message }: CompactionMessageProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      {message.status === "succeeded" && (
        <span className="text-base text-muted-foreground">
          Context compacted · {formatCompactionTime(message.created)}
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
