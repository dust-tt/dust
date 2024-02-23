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

    if (shortVersion) {
      const messageCount = boldIfRequested(
        `${usage.messageCount} message${pluralize(usage.messageCount)}`
      );

      return (
        <>
          {messageCount} over the last {days} days
        </>
      );
    }

    const usersWithAgentInListCount = boldIfRequested(
      `${usage.usersWithAgentInListCount} member${pluralize(
        usage.usersWithAgentInListCount
      )}`
    );
    const messageCount = boldIfRequested(
      `${usage.messageCount} time${pluralize(usage.messageCount)}`
    );
    const userCount = boldIfRequested(
      `${usage.userCount} member${pluralize(usage.userCount)}`
    );

    return (
      <>
        {`${
          assistantName ? "@" + assistantName : "This assistant"
        } is active for`}{" "}
        {usersWithAgentInListCount} and has been used {messageCount} by{" "}
        {userCount} in the last {usage.timePeriodSec / (60 * 60 * 24)} days.
      </>
    );
  }
}
