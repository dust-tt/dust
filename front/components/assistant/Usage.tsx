import type { ReactNode } from "react";

import type { AgentUsageType } from "@app/types";
import { pluralize } from "@app/types";

export function assistantUsageMessage<T extends boolean>({
  assistantName,
  usage,
  isLoading,
  isError,
  shortVersion,
  boldVersion,
  asString,
}: {
  assistantName: string | null;
  usage: AgentUsageType | null;
  isLoading: boolean;
  isError: boolean;
  shortVersion?: boolean;
  boldVersion?: boolean;
  asString?: T;
}): T extends true ? string : ReactNode {
  if (isError) {
    return "Error loading usage data." as T extends true ? string : ReactNode;
  }

  if (isLoading) {
    return "Loading usage data..." as T extends true ? string : ReactNode;
  }

  function boldIfRequested(text: string) {
    return boldVersion && !asString ? (
      <span className="font-bold">{text}</span>
    ) : (
      text
    );
  }

  if (usage) {
    const days = usage.timePeriodSec / (60 * 60 * 24);
    const nb = usage.messageCount || 0;

    if (shortVersion) {
      const messageCount = boldIfRequested(`${nb} message${pluralize(nb)}`);

      return (
        asString ? (
          `${nb} message${pluralize(nb)} over the last ${days} days`
        ) : (
          <>
            {messageCount} over the last {days} days
          </>
        )
      ) as T extends true ? string : ReactNode;
    }

    const messageCount = boldIfRequested(`${nb} time${pluralize(nb)}`);

    return (
      asString ? (
        `${assistantName ? "@" + assistantName : "This agent"} has been used ${nb} time${pluralize(nb)} in the last ${usage.timePeriodSec / (60 * 60 * 24)} days.`
      ) : (
        <>
          {assistantName ? "@" + assistantName : "This agent"} has been used{" "}
          {messageCount} in the last {usage.timePeriodSec / (60 * 60 * 24)}{" "}
          days.
        </>
      )
    ) as T extends true ? string : ReactNode;
  }

  return "" as T extends true ? string : ReactNode;
}

function assistantActiveUsersMessage<T extends boolean>({
  usage,
  isLoading,
  isError,
  asString,
}: {
  usage: AgentUsageType | null;
  isLoading: boolean;
  isError: boolean;
  asString?: T;
}): T extends true ? string : ReactNode {
  if (isError) {
    return "Error loading usage data." as T extends true ? string : ReactNode;
  }

  if (isLoading) {
    return "Loading usage data..." as T extends true ? string : ReactNode;
  }

  if (usage) {
    const days = usage.timePeriodSec / (60 * 60 * 24);
    const nb = usage.userCount || 0;

    return (
      asString ? (
        `${nb} active user${pluralize(nb)} over the last ${days} days`
      ) : (
        <>
          {nb} active user{pluralize(nb)} over the last {days} days
        </>
      )
    ) as T extends true ? string : ReactNode;
  }

  return "" as T extends true ? string : ReactNode;
}
