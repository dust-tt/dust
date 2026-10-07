import type { AgentUsageType } from "@app/types/assistant/agent";
import { Plural, Trans } from "@lingui/react/macro";
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
    return <Trans>Error loading usage data.</Trans>;
  }

  if (isLoading) {
    return <Trans>Loading usage data...</Trans>;
  }

  if (usage) {
    const days = usage.timePeriodSec / (60 * 60 * 24);
    const nb = usage.messageCount || 0;
    const countClassName = boldVersion ? "font-bold" : undefined;

    if (shortVersion) {
      return (
        <Trans>
          <span className={countClassName}>
            <Plural value={nb} one="# message" other="# messages" />
          </span>{" "}
          over the last <Plural value={days} one="# day" other="# days" />
        </Trans>
      );
    }

    if (!assistantName) {
      return (
        <Trans>
          This agent has been used{" "}
          <span className={countClassName}>
            <Plural value={nb} one="# time" other="# times" />
          </span>{" "}
          in the last <Plural value={days} one="# day" other="# days" />.
        </Trans>
      );
    }

    return (
      <Trans>
        {assistantName} has been used{" "}
        <span className={countClassName}>
          <Plural value={nb} one="# time" other="# times" />
        </span>{" "}
        in the last <Plural value={days} one="# day" other="# days" />.
      </Trans>
    );
  }

  return "";
}
