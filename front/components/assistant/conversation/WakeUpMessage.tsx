import { useConversationWakeUps } from "@app/lib/swr/wakeups";
import { formatTimestring } from "@app/lib/utils/timestamps";
import type { UserMessageTypeWithContentFragments } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect } from "react";

interface WakeUpMessageProps {
  message: UserMessageTypeWithContentFragments;
  owner: LightWorkspaceType;
  conversationId: string | null;
}

export function WakeUpMessage({
  message,
  owner,
  conversationId,
}: WakeUpMessageProps) {
  const { mutateWakeUps } = useConversationWakeUps({
    owner,
    conversationId: conversationId ?? "",
    disabled: !conversationId,
  });

  useEffect(() => {
    if (message.visibility !== "pending") {
      void mutateWakeUps();
    }
  }, [message.visibility, mutateWakeUps]);

  const label =
    message.visibility === "pending" ? "Wake-up pending" : "Wake-up executed";

  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {label} · {formatTimestring(message.created)}
      </span>
    </div>
  );
}
