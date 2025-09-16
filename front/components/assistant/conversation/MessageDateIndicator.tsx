import moment from "moment-timezone";

import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { getMessageDate } from "@app/components/assistant/conversation/types";

export const MessageDateIndicator = ({
  message,
}: {
  message: VirtuosoMessage;
}) => {
  return (
    <div className="text-center">
      <span className="rounded bg-background px-4 text-xs text-muted-foreground dark:bg-background-night dark:text-muted-foreground-night">
        {moment(getMessageDate(message)).calendar(null, {
          sameDay: "[Today]",
          nextDay: "[Tomorrow]",
          nextWeek: "dddd",
          lastDay: "[Yesterday]",
          lastWeek: "[Last] dddd",
          sameElse: "DD/MM/YYYY",
        })}
      </span>
    </div>
  );
};
