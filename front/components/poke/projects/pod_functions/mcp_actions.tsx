import { PokeJsonBlock } from "@app/components/poke/projects/pod_functions/json_block";
import type { ToolExecutionBaseStatus } from "@app/lib/actions/statuses";
import type { PokeSandboxFunctionMCPAction } from "@app/lib/api/poke/sandbox_functions";
import { usePokeSandboxFunctionMCPActionOutput } from "@app/poke/swr/pod_function_details";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessageInline,
  LinkWrapper,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import type { ComponentProps } from "react";
import { useState } from "react";

type ChipColor = ComponentProps<typeof Chip>["color"];

function colorForActionStatus(status: ToolExecutionBaseStatus): ChipColor {
  switch (status) {
    case "succeeded":
      return "success";
    case "errored":
    case "denied":
      return "warning";
    case "running":
    case "blocked_authentication_required":
    case "blocked_validation_required":
      return "info";
    default:
      assertNeverAndIgnore(status);
      return "primary";
  }
}

interface InvocationMCPActionsProps {
  actions: PokeSandboxFunctionMCPAction[];
  functionId: string;
  invocationId: string;
  owner: LightWorkspaceType;
  projectId: string;
}

export function InvocationMCPActions({
  actions,
  functionId,
  invocationId,
  owner,
  projectId,
}: InvocationMCPActionsProps) {
  if (actions.length === 0) {
    return (
      <p className="py-1 text-sm text-muted-foreground">
        No MCP actions for this invocation.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {actions.map((action, idx) => (
        <div key={action.sId}>
          <MCPActionRow
            action={action}
            functionId={functionId}
            invocationId={invocationId}
            owner={owner}
            projectId={projectId}
          />
          {idx < actions.length - 1 && <Separator />}
        </div>
      ))}
    </div>
  );
}

interface MCPActionRowProps {
  action: PokeSandboxFunctionMCPAction;
  functionId: string;
  invocationId: string;
  owner: LightWorkspaceType;
  projectId: string;
}

function MCPActionRow({
  action,
  functionId,
  invocationId,
  owner,
  projectId,
}: MCPActionRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { output, isLoading, isError } = usePokeSandboxFunctionMCPActionOutput({
    owner,
    projectId,
    functionId,
    invocationId,
    actionId: action.sId,
    disabled: !isOpen || !action.hasOutput,
  });

  return (
    <Collapsible defaultOpen={false} onOpenChange={setIsOpen}>
      <CollapsibleTrigger>
        <div className="my-2 flex w-full items-center justify-between gap-4">
          <span className="font-mono text-sm">{action.toolName}</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {action.mcpServerName && <span>{action.mcpServerName}</span>}
            {action.executionDurationMs !== null && (
              <span>{action.executionDurationMs}ms</span>
            )}
            <Chip
              color={colorForActionStatus(action.status)}
              size="xs"
              label={action.status}
              className="select-none"
            />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 pb-2 pl-4">
          {action.mcpServerViewId && (
            <LinkWrapper
              href={`/poke/${owner.sId}/spaces/${projectId}/mcp_server_views/${action.mcpServerViewId}`}
              className="text-xs text-highlight-500"
            >
              View MCP server view
            </LinkWrapper>
          )}
          <PokeJsonBlock defaultOpen label="Inputs" value={action.inputs} />
          {!action.hasOutput ? (
            <p className="py-1 text-sm text-muted-foreground">
              No output recorded.
            </p>
          ) : isError ? (
            <ContentMessageInline variant="warning">
              Unable to load the action output.
            </ContentMessageInline>
          ) : isLoading ? (
            <div className="flex items-center gap-2 py-1">
              <Spinner size="sm" />
              <span className="text-sm text-muted-foreground">
                Loading output...
              </span>
            </div>
          ) : (
            <PokeJsonBlock defaultOpen label="Output" value={output} />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
