import type { ChipColor } from "@app/components/poke/conversation/message_metadata";
import { formatDurationMs } from "@app/components/poke/conversation/message_metadata";
import type { PokeAgentMessageType } from "@app/types/poke";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  buttonVariants,
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

interface ToolActionContentProps {
  action: PokeAgentMessageType["actions"][number];
  isExpanded: boolean;
}

interface ToolActionViewProps extends ToolActionContentProps {
  onToggle: () => void;
}

function ToolActionContent({ action, isExpanded }: ToolActionContentProps) {
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
          <span
            aria-hidden="true"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              isIconOnly: true,
              press: false,
            })}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform motion-reduce:transition-none",
                !isExpanded ? "-rotate-90" : null
              )}
            />
          </span>
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
      <span className="w-8 shrink-0" />
    </>
  );
}

export function ToolActionView({
  action,
  isExpanded,
  onToggle,
}: ToolActionViewProps) {
  const Row = action.mcpIO ? "button" : "div";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative">
        <Row
          type={action.mcpIO ? "button" : undefined}
          onClick={action.mcpIO ? onToggle : undefined}
          aria-expanded={action.mcpIO ? isExpanded : undefined}
          aria-label={
            action.mcpIO
              ? `${isExpanded ? "Collapse" : "Expand"} ${getActionLabel(action)} details`
              : undefined
          }
          className={cn(
            "flex w-full items-center gap-2 rounded-md border",
            "border-separator bg-muted-background p-2 text-left",
            action.status === "errored"
              ? "border-border-warning bg-background"
              : null,
            action.mcpIO &&
              cn(
                "cursor-pointer transition-colors hover:bg-background",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "motion-reduce:transition-none"
              )
          )}
        >
          <ToolActionContent action={action} isExpanded={isExpanded} />
        </Row>
        {action.runId && (
          <a
            href={`/w/${action.appWorkspaceId}/spaces/${action.appSpaceId}/apps/${action.appId}/runs/${action.runId}`}
            title={action.runId}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2",
              "text-sm text-highlight hover:underline"
            )}
          >
            Run
          </a>
        )}
      </div>
      {action.mcpIO && isExpanded && (
        <div className="pl-9">
          <div className="overflow-hidden rounded-md border border-separator bg-background">
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
        </div>
      )}
    </div>
  );
}
