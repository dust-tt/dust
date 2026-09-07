import { InvocationMCPActions } from "@app/components/poke/frames/functions/mcp_actions";
import { PokeJsonBlock } from "@app/components/poke/sandbox_functions/json_block";
import type { PokeSandboxFunctionInvocation } from "@app/lib/api/poke/sandbox_functions";
import {
  usePokeSandboxFunctionInvocation,
  usePokeSandboxFunctionInvocations,
} from "@app/poke/swr/frame_function_details";
import type {
  SandboxFunctionInvocationOrigin,
  SandboxFunctionInvocationStatus,
} from "@app/types/api/sandbox_functions";
import {
  SANDBOX_FUNCTION_INVOCATION_ORIGINS,
  SANDBOX_FUNCTION_INVOCATION_STATUSES,
} from "@app/types/api/sandbox_functions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessageInline,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import moment from "moment";
import type { ComponentProps } from "react";
import { useState } from "react";

const PAGE_SIZE = 25;

type ChipColor = ComponentProps<typeof Chip>["color"];

function colorForInvocationStatus(
  status: SandboxFunctionInvocationStatus
): ChipColor {
  switch (status) {
    case "succeeded":
      return "success";
    case "errored":
      return "warning";
    case "created":
      return "info";
    default:
      assertNeverAndIgnore(status);
      return "primary";
  }
}

// The invocation row records no duration of its own: `updatedAt` is the moment the terminal status
// was written, so the elapsed time is only meaningful once the invocation has settled.
function elapsedLabel(
  invocation: PokeSandboxFunctionInvocation
): string | null {
  if (invocation.status === "created") {
    return null;
  }

  const elapsedMs =
    new Date(invocation.updatedAt).getTime() -
    new Date(invocation.createdAt).getTime();

  return `~${(elapsedMs / 1000).toFixed(1)}s`;
}

interface FrameFunctionInvocationsProps {
  functionId: string;
  owner: LightWorkspaceType;
  frameId: string;
}

export function FrameFunctionInvocations({
  functionId,
  owner,
  frameId,
}: FrameFunctionInvocationsProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [status, setStatus] = useState<
    SandboxFunctionInvocationStatus | undefined
  >(undefined);
  const [origin, setOrigin] = useState<
    SandboxFunctionInvocationOrigin | undefined
  >(undefined);

  const { invocations, isLoading, isError } = usePokeSandboxFunctionInvocations(
    {
      owner,
      frameId,
      functionId,
      limit,
      status,
      origin,
    }
  );

  const hasMore = invocations.length === limit;

  return (
    <div className="my-4 flex min-h-24 flex-col rounded-lg border bg-background">
      <div className="flex justify-between gap-3 rounded-t-lg border-b border-separator bg-background p-4">
        <h2 className="text-md font-bold">Invocations</h2>
      </div>
      <div className="flex flex-grow flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            color={status === undefined ? "highlight" : "primary"}
            size="xs"
            label="All statuses"
            className="cursor-pointer select-none"
            onClick={() => {
              setStatus(undefined);
              setLimit(PAGE_SIZE);
            }}
          />
          {SANDBOX_FUNCTION_INVOCATION_STATUSES.map((s) => (
            <Chip
              key={s}
              color={status === s ? "highlight" : "primary"}
              size="xs"
              label={s}
              className="cursor-pointer select-none"
              onClick={() => {
                setStatus(s);
                setLimit(PAGE_SIZE);
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            color={origin === undefined ? "highlight" : "primary"}
            size="xs"
            label="All origins"
            className="cursor-pointer select-none"
            onClick={() => {
              setOrigin(undefined);
              setLimit(PAGE_SIZE);
            }}
          />
          {SANDBOX_FUNCTION_INVOCATION_ORIGINS.map((o) => (
            <Chip
              key={o}
              color={origin === o ? "highlight" : "primary"}
              size="xs"
              label={o}
              className="cursor-pointer select-none"
              onClick={() => {
                setOrigin(o);
                setLimit(PAGE_SIZE);
              }}
            />
          ))}
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 pt-2">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground">
              Loading invocations...
            </span>
          </div>
        ) : isError ? (
          <ContentMessageInline variant="warning" className="mt-2">
            Unable to load invocations.
          </ContentMessageInline>
        ) : invocations.length === 0 ? (
          <p className="pt-2 text-sm text-muted-foreground">
            No invocation matches these filters.
          </p>
        ) : (
          <>
            <div className="flex flex-col px-4">
              {invocations.map((invocation, idx) => (
                <div key={invocation.sId}>
                  <InvocationRow
                    functionId={functionId}
                    invocation={invocation}
                    owner={owner}
                    frameId={frameId}
                  />
                  {idx < invocations.length - 1 && <Separator />}
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  label="Load more"
                  onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface InvocationRowProps {
  functionId: string;
  invocation: PokeSandboxFunctionInvocation;
  owner: LightWorkspaceType;
  frameId: string;
}

function InvocationRow({
  functionId,
  invocation,
  owner,
  frameId,
}: InvocationRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    invocation: details,
    isLoading,
    isError,
  } = usePokeSandboxFunctionInvocation({
    owner,
    frameId,
    functionId,
    invocationId: invocation.sId,
    disabled: !isOpen,
  });

  const elapsed = elapsedLabel(invocation);

  return (
    <Collapsible defaultOpen={false} onOpenChange={setIsOpen}>
      <CollapsibleTrigger>
        <div className="my-2 flex w-full items-center justify-between gap-4">
          <span className="text-sm">
            {moment(new Date(invocation.createdAt)).calendar(undefined, {
              sameDay: "[Today at] LTS",
              lastDay: "[Yesterday at] LTS",
              lastWeek: "[Last] dddd [at] LTS",
            })}
          </span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{invocation.user ?? "—"}</span>
            <span>{invocation.origin ?? "unknown origin"}</span>
            {elapsed && <span>{elapsed}</span>}
            <span>{invocation.mcpActionCount} MCP actions</span>
            <Chip
              color={colorForInvocationStatus(invocation.status)}
              size="xs"
              label={invocation.status}
              className="select-none"
            />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {isLoading ? (
          <div className="flex items-center gap-2 pb-2">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground">
              Loading invocation...
            </span>
          </div>
        ) : isError || !details ? (
          <ContentMessageInline variant="warning" className="mb-2">
            Unable to load this invocation.
          </ContentMessageInline>
        ) : (
          <div className="flex flex-col gap-2 pb-2 pl-4">
            <PokeJsonBlock defaultOpen label="Input" value={details.input} />
            <PokeJsonBlock defaultOpen label="Result" value={details.result} />
            {details.error && (
              <PokeJsonBlock defaultOpen label="Error" value={details.error} />
            )}
            <span className="pt-2 text-sm font-semibold">
              MCP actions ({details.mcpActions.length})
            </span>
            <InvocationMCPActions
              actions={details.mcpActions}
              functionId={functionId}
              invocationId={invocation.sId}
              owner={owner}
              frameId={frameId}
            />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
