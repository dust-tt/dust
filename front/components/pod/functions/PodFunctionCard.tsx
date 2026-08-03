import { PodFunctionLastFailure } from "@app/components/pod/functions/PodFunctionLastFailure";
import { PodFunctionSchema } from "@app/components/pod/functions/PodFunctionSchema";
import type {
  PodFrameReferenceType,
  PodFunctionType,
  SandboxFunctionInvocationStatus,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import { format, formatDistanceToNow, isToday } from "date-fns";
import type { ComponentProps } from "react";
import { useState } from "react";

type ChipColor = ComponentProps<typeof Chip>["color"];

function statusChip(status: SandboxFunctionInvocationStatus): {
  color: ChipColor;
  label: string;
} {
  switch (status) {
    case "succeeded":
      return { color: "success", label: "ok" };
    case "errored":
      return { color: "warning", label: "failed" };
    case "created":
      return { color: "info", label: "running" };
    default:
      assertNeverAndIgnore(status);
      return { color: "primary", label: status };
  }
}

// Only surfaced when it constrains who can call the function; `optional` is the default and says
// nothing worth a line in the UI.
function identityLabel(
  userIdentity: SandboxFunctionUserIdentityPolicy
): string | null {
  switch (userIdentity) {
    case "optional":
      return null;
    case "workspace_user_required":
      return "Runs as the calling user";
    case "interactive_workspace_user_required":
      return "Requires an interactive user";
    default:
      assertNeverAndIgnore(userIdentity);
      return null;
  }
}

function lastRunLabel(lastRunAt: string): string {
  const date = new Date(lastRunAt);

  return isToday(date)
    ? `last run ${format(date, "pp")}`
    : `last run ${formatDistanceToNow(date, { addSuffix: true })}`;
}

interface PodFunctionCardProps {
  podFunction: PodFunctionType;
  podId: string;
  usedByFrames: PodFrameReferenceType[];
  workspaceId: string;
}

export function PodFunctionCard({
  podFunction,
  podId,
  usedByFrames,
  workspaceId,
}: PodFunctionCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { activity } = podFunction;
  const identity = identityLabel(podFunction.userIdentity);
  const hasFailed = activity.lastRunStatus === "errored";

  return (
    <div className="border-material-200 flex flex-col rounded-lg border p-4">
      <Collapsible defaultOpen={false} onOpenChange={setIsOpen}>
        <CollapsibleTrigger>
          <div className="flex w-full flex-col gap-1 text-left">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">
                {podFunction.slug}
              </span>
              {activity.lastRunStatus && (
                <Chip
                  color={statusChip(activity.lastRunStatus).color}
                  size="xs"
                  label={statusChip(activity.lastRunStatus).label}
                  className="select-none"
                />
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {podFunction.description}
            </span>
            <span className="text-xs text-muted-foreground">
              {podFunction.author ?? "Unknown author"} ·{" "}
              {activity.lastRunAt
                ? `${lastRunLabel(activity.lastRunAt)} · ${activity.runCountLastWeek} runs this week`
                : "never run"}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-4 pt-4">
            {identity && (
              <span className="text-xs text-muted-foreground">{identity}</span>
            )}
            <PodFunctionSchema
              label="Input"
              emptyLabel="Takes no input."
              schema={podFunction.inputSchema}
            />
            <PodFunctionSchema
              label="Output"
              emptyLabel="Returns no output."
              schema={podFunction.outputSchema}
            />
            {usedByFrames.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  Called by {usedByFrames.length}{" "}
                  {usedByFrames.length === 1 ? "frame" : "frames"} in this pod
                </span>
                <ul className="flex flex-col">
                  {usedByFrames.map((frame) => (
                    <li key={frame.fileId} className="text-sm">
                      {frame.fileName}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasFailed && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  Last failure
                </span>
                <PodFunctionLastFailure
                  disabled={!isOpen}
                  functionId={podFunction.sId}
                  podId={podId}
                  workspaceId={workspaceId}
                />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
