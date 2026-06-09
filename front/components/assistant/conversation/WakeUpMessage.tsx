import { formatTimestring } from "@app/lib/utils/timestamps";
import type { UserMessageTypeWithContentFragments } from "@app/types/assistant/conversation";

interface WakeUpMessageProps {
  message: UserMessageTypeWithContentFragments;
}

export function WakeUpMessage({ message }: WakeUpMessageProps) {
  const label =
    message.visibility === "pending" ? "Wake-up pending" : "Wake-up executed";

  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="text-sm text-muted-foreground">
        {label} · {formatTimestring(message.created)}
      </span>
    </div>
  );
}
