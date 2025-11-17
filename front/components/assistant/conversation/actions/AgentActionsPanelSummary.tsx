import { Separator } from "@dust-tt/sparkle";
import type React from "react";

import { formatDurationString } from "@app/lib/utils/timestamps";
import type {
  AgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types";

export function AgentActionSummary({
  agentMessageToRender,
  nbSteps,
}: {
  agentMessageToRender: AgentMessageType | LightAgentMessageWithActionsType;
  nbSteps: number;
}) {
  // Do not display summary if we did not store the completion time.
  // All new agent messages should have a completion time as of now.
  if (!agentMessageToRender.completedTs) {
    return null;
  }

  const nbActions = agentMessageToRender.actions.length;
  const showSeparator = nbActions > 0;
  const completedInMs =
    agentMessageToRender.completedTs - agentMessageToRender.created;

  let statusText = "Completed in";
  if (agentMessageToRender.status === "failed") {
    statusText = "Errored after";
  } else if (agentMessageToRender.status === "cancelled") {
    statusText = "Cancelled after";
  }

  const timeString = formatDurationString(completedInMs);
  const toolsText =
    nbActions === 0
      ? "without tools"
      : `using ${nbActions} ${nbActions === 1 ? "tool" : "tools"}`;

  const stepsText = nbSteps > 1 ? ` across ${nbSteps} steps` : "";

  return (
    <div className="flex flex-col gap-4 duration-500 animate-in fade-in slide-in-from-left-2">
      {showSeparator && <Separator className="my-4" />}

      <div className="flex items-center gap-2">
        <span className="text-size w-fit self-start text-lg font-semibold">
          Summary
        </span>
      </div>
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {`${statusText} ${timeString}, ${toolsText}${stepsText}.`}
      </div>
    </div>
  );
}
