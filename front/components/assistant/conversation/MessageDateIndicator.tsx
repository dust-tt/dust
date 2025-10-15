import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { getMessageDate } from "@app/components/assistant/conversation/types";
import { formatCalendarDate } from "@app/lib/utils/timestamps";

export const MessageDateIndicator = ({
  message,
}: {
  message: VirtuosoMessage;
}) => {
  return (
    <div className="select-none text-center">
      <span className="rounded bg-background px-4 text-xs text-muted-foreground dark:bg-background-night dark:text-muted-foreground-night">
        {formatCalendarDate(getMessageDate(message))}
      </span>
    </div>
  );
};
