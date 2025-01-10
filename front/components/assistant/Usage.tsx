import type { AgentUsageType } from "@dust-tt/types";
import { pluralize } from "@dust-tt/types";
import type { ReactNode } from "react";

export function assistantUsageMessage({
  assistantName,
  usage,
  isLoading,
  isError,
  shortVersion,
  boldVersion,
}: {
  assistantName: string | null;
  usage: AgentUsageType | null;
  isLoading: boolean;
  isError: boolean;
  shortVersion?: boolean;
  boldVersion?: boolean;
}): ReactNode {
  if (isError) {
    return "Error loading usage data.";
  }

  if (isLoading) {
    return "Loading usage data...";
  }

  function boldIfRequested(text: string) {
    return boldVersion ? <span className="font-bold">{text}</span> : text;
  }

  if (usage) {
    const days = usage.timePeriodSec / (60 * 60 * 24);
    const nb = usage.messageCount || 0;

    if (shortVersion) {
      const messageCount = boldIfRequested(`${nb} message${pluralize(nb)}`);

      return (
        <>
          {messageCount} over the last {days} days
        </>
      );
    }
    const messageCount = boldIfRequested(`${nb} time${pluralize(nb)}`);

    return (
      <>
        {assistantName ? "@" + assistantName : "This assistant"} has been used{" "}
        {messageCount} in the last {usage.timePeriodSec / (60 * 60 * 24)} days.
      </>
    );
  }
}
