import type { AgentUsageType } from "@app/types/assistant/agent";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { ReactNode } from "react";

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
    const agentDisplayName = assistantName || "This agent";

    return (
      asString ? (
        `${agentDisplayName} has been used ${nb} time${pluralize(nb)} in the last ${usage.timePeriodSec / (60 * 60 * 24)} days.`
      ) : (
        <>
          {agentDisplayName} has been used {messageCount} in the last&nbsp;
          {usage.timePeriodSec / (60 * 60 * 24)} days.
        </>
      )
    ) as T extends true ? string : ReactNode;
  }

  return "" as T extends true ? string : ReactNode;
}
