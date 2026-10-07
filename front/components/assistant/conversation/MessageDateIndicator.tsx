import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { getMessageDate } from "@app/components/assistant/conversation/types";
import { formatCalendarDate } from "@app/lib/client/calendar_date";
import { useLingui } from "@lingui/react/macro";

export const MessageDateIndicator = ({
  message,
}: {
  message: VirtuosoMessage;
}) => {
  const { t } = useLingui();

  return (
    <div className="mb-3 mt-1 select-none text-center">
      <span className="rounded px-4 text-xs text-muted-foreground">
        {formatCalendarDate(getMessageDate(message), t)}
      </span>
    </div>
  );
};
