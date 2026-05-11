import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { formatTimestampToFriendlyDate, timeAgoFrom } from "@app/lib/utils";
import { usePokeProjectWorkflow } from "@app/poke/swr/project_tasks_workflow";
import type { WorkspaceType } from "@app/types/user";
import { Chip, LinkWrapper, Spinner } from "@dust-tt/sparkle";

interface ViewProjectWorkflowTableProps {
  owner: WorkspaceType;
  projectId: string;
}

export function ViewProjectWorkflowTable({
  owner,
  projectId,
}: ViewProjectWorkflowTableProps) {
  const { data, isLoading, isError } = usePokeProjectWorkflow({
    owner,
    projectId,
  });

  return (
    <div className="border-material-200 my-4 flex min-h-24 flex-col rounded-lg border bg-muted-background dark:bg-muted-background-night">
      <div className="flex justify-between gap-3 rounded-t-lg bg-primary-300 p-4 dark:bg-primary-300-night">
        <h2 className="text-md font-bold">Task generation workflow</h2>
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : isError || !data ? (
          <div className="flex h-32 items-center justify-center">
            <p>Error loading workflow.</p>
          </div>
        ) : (
          <ViewProjectWorkflowTableContent data={data} />
        )}
      </div>
    </div>
  );
}

function RunIdCell({
  runId,
  status,
  href,
}: {
  runId: string;
  status: string;
  href: string | null;
}) {
  const label = `${runId} (${status})`;
  if (!href) {
    return <span className="font-mono">{label}</span>;
  }
  return (
    <LinkWrapper
      href={href}
      target="_blank"
      className="font-mono text-highlight-400"
    >
      {label}
    </LinkWrapper>
  );
}

function ViewProjectWorkflowTableContent({
  data,
}: {
  data: NonNullable<ReturnType<typeof usePokeProjectWorkflow>["data"]>;
}) {
  const { metadata, temporalNamespace, workflowId, latestWorkflow } = data;
  const generationEnabled = metadata?.todoGenerationEnabled ?? false;

  const temporalSearchUrl = temporalNamespace
    ? `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows?query=WorkflowId%3D%22${encodeURIComponent(
        workflowId
      )}%22`
    : null;
  const temporalRunUrl = (runId: string) =>
    temporalNamespace
      ? `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${encodeURIComponent(
          workflowId
        )}/${encodeURIComponent(runId)}/history`
      : null;

  return (
    <PokeTable>
      <PokeTableBody>
        <PokeTableRow>
          <PokeTableHead>Generation enabled</PokeTableHead>
          <PokeTableCell>
            {generationEnabled ? (
              <Chip color="success" label="Yes" size="xs" />
            ) : (
              <Chip color="warning" label="No" size="xs" />
            )}
          </PokeTableCell>
        </PokeTableRow>
        <PokeTableRow>
          <PokeTableHead>Last analysis at</PokeTableHead>
          <PokeTableCell>
            {metadata?.lastTodoAnalysisAt ? (
              <>
                {formatTimestampToFriendlyDate(metadata.lastTodoAnalysisAt)} (
                {timeAgoFrom(metadata.lastTodoAnalysisAt, {
                  useLongFormat: true,
                })}{" "}
                ago)
              </>
            ) : (
              <span className="font-bold text-warning-500">never</span>
            )}
          </PokeTableCell>
        </PokeTableRow>
        <PokeTableRow>
          <PokeTableHead>Workflow ID</PokeTableHead>
          <PokeTableCellWithCopy label={workflowId} />
        </PokeTableRow>
        <PokeTableRow>
          <PokeTableHead>Latest run</PokeTableHead>
          <PokeTableCell>
            {latestWorkflow ? (
              <span>
                <RunIdCell
                  runId={latestWorkflow.runId}
                  status={latestWorkflow.status}
                  href={temporalRunUrl(latestWorkflow.runId)}
                />
                {latestWorkflow.closeTime && (
                  <>
                    {" "}
                    — closed{" "}
                    {timeAgoFrom(latestWorkflow.closeTime, {
                      useLongFormat: true,
                    })}{" "}
                    ago
                  </>
                )}
              </span>
            ) : (
              <span className="font-bold text-warning-500">no executions</span>
            )}
          </PokeTableCell>
        </PokeTableRow>
        <PokeTableRow>
          <PokeTableHead>Links</PokeTableHead>
          <PokeTableCell>
            {temporalSearchUrl && (
              <>
                <LinkWrapper
                  href={temporalSearchUrl}
                  target="_blank"
                  className="text-sm text-highlight-400"
                >
                  Temporal (all runs)
                </LinkWrapper>{" "}
                /{" "}
              </>
            )}
            <LinkWrapper
              href={`https://app.datadoghq.eu/logs?query=%40workflowId%3A${encodeURIComponent(
                workflowId
              )}`}
              target="_blank"
              className="text-sm text-highlight-400"
            >
              Datadog
            </LinkWrapper>
          </PokeTableCell>
        </PokeTableRow>
      </PokeTableBody>
    </PokeTable>
  );
}
