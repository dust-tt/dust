import { formatTimestring } from "@app/lib/utils/timestamps";
import type { UserMessageTypeWithContentFragments } from "@app/types/assistant/conversation";
import { useLingui } from "@lingui/react/macro";

interface WakeUpMessageProps {
  message: UserMessageTypeWithContentFragments;
}

export function WakeUpMessage({ message }: WakeUpMessageProps) {
  const { t } = useLingui();
  const label =
    message.visibility === "pending" ? t`Wake-up pending` : t`Wake-up executed`;

  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="text-sm text-muted-foreground">
        {label} · {formatTimestring(message.created)}
      </span>
    </div>
  );
}
