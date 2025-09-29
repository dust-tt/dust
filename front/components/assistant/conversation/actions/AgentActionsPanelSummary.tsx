import { Separator } from "@dust-tt/sparkle";
import type React from "react";

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

  const timeString = formatDuration(completedInMs);
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

// Util to format time duration:
// takes a number of milliseconds and returns a string like "1 min 30 sec".
const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }
  return `${minutes} min ${remainingSeconds} sec`;
};
