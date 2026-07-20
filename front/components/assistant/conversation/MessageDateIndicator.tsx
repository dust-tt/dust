import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { getMessageDate } from "@app/components/assistant/conversation/types";
import { formatCalendarDate } from "@app/lib/utils/timestamps";

export const MessageDateIndicator = ({
  message,
}: {
  message: VirtuosoMessage;
}) => {
  return (
    <div className="mb-3 mt-1 select-none text-center">
      <span className="rounded px-4 text-xs text-muted-foreground">
        {formatCalendarDate(getMessageDate(message))}
      </span>
    </div>
  );
};
