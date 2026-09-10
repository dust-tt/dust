import type { ChipColor } from "@app/components/poke/conversation/message_metadata";
import { formatDurationMs } from "@app/components/poke/conversation/message_metadata";
import type { PokeAgentMessageType } from "@app/types/poke";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  Button,
  Check,
  ChevronDown,
  Chip,
  CodeBlock,
  cn,
  XClose,
} from "@dust-tt/sparkle";

function getActionLabel(action: PokeAgentMessageType["actions"][number]) {
  return action.displayLabels?.done ?? action.functionCallName;
}

function getActionStatus(
  status: PokeAgentMessageType["actions"][number]["status"]
): null | {
  color: ChipColor;
  label: string;
} {
  switch (status) {
    case "succeeded":
      return null;
    case "errored":
      return { label: "error", color: "warning" };
    case "denied":
      return { label: "denied", color: "primary" };
    case "running":
      return { label: "running", color: "highlight" };
    case "ready_allowed_explicitly":
    case "ready_allowed_implicitly":
      return { label: "ready", color: "primary" };
    case "blocked_authentication_required":
    case "blocked_child_action_input_required":
    case "blocked_file_authorization_required":
    case "blocked_user_answer_required":
    case "blocked_validation_required":
      return { label: "blocked", color: "warning" };
    default:
      assertNeverAndIgnore(status);
      return { label: status, color: "primary" };
  }
}

interface ToolActionViewProps {
  action: PokeAgentMessageType["actions"][number];
  isExpanded: boolean;
  onToggle: () => void;
}

function ToolActionContent({
  action,
  isExpanded,
  onToggle,
}: ToolActionViewProps) {
  const actionStatus = getActionStatus(action.status);
  const ActionIcon = action.status === "errored" ? XClose : Check;
  const actionLabel = getActionLabel(action);
  const duration =
    "executionDurationMs" in action &&
    typeof action.executionDurationMs === "number"
      ? formatDurationMs(action.executionDurationMs)
      : "—";

  return (
    <>
      <span className="shrink-0">
        {action.mcpIO ? (
          <Button
            variant="outline"
            size="icon"
            icon={
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  !isExpanded ? "-rotate-90" : null
                )}
              />
            }
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={
              isExpanded ? "Collapse tool details" : "Expand tool details"
            }
          />
        ) : (
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center",
              "rounded-md border border-separator bg-background"
            )}
          >
            <ActionIcon className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">
          {action.created ? new Date(action.created).toLocaleTimeString() : "—"}
        </span>
        <Chip label={`Step ${action.step}`} />
        <span className="flex min-w-0 flex-col">
          <span
            className="truncate text-sm font-medium text-foreground"
            title={actionLabel}
          >
            {actionLabel}
          </span>
          {actionLabel !== action.functionCallName && (
            <span
              className="truncate font-mono text-xs text-muted-foreground"
              title={action.functionCallName}
            >
              {action.functionCallName}
            </span>
          )}
        </span>
        {actionStatus && (
          <Chip
            color={actionStatus.color}
            label={actionStatus.label}
            size="xs"
          />
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {duration}
      </span>
      <span className="w-8 shrink-0 text-right">
        {action.runId && (
          <a
            href={`/w/${action.appWorkspaceId}/spaces/${action.appSpaceId}/apps/${action.appId}/runs/${action.runId}`}
            title={action.runId}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-highlight hover:underline"
          >
            Run
          </a>
        )}
      </span>
    </>
  );
}

export function ToolActionView({
  action,
  isExpanded,
  onToggle,
}: ToolActionViewProps) {
  return (
    <div>
      <div
        className={cn(
          "mt-2 flex w-full items-center gap-2 rounded-md border border-separator bg-muted-background p-2 text-left",
          action.status === "errored"
            ? "border-border-warning bg-background"
            : null
        )}
      >
        <ToolActionContent
          action={action}
          isExpanded={isExpanded}
          onToggle={onToggle}
        />
      </div>
      {action.mcpIO && isExpanded && (
        <div className="ml-9 mt-2 overflow-hidden rounded-md border border-separator bg-background">
          <CodeBlock wrapLongLines className="language-json">
            {JSON.stringify(
              {
                params: action.mcpIO.params,
                output: action.mcpIO.output,
                generatedFiles: action.mcpIO.generatedFiles,
              },
              undefined,
              2
            )}
          </CodeBlock>
        </div>
      )}
    </div>
  );
}
