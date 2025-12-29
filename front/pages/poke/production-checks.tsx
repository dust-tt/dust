import {
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  PlayIcon,
  Spinner,
} from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";
import React, { useState } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import {
  usePokeCheckHistory,
  usePokeProductionChecks,
} from "@app/poke/swr/production_checks";
import type {
  ActionLink,
  CheckHistoryRun,
  CheckSummary,
  CheckSummaryStatus,
} from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

interface StatusChipProps {
  status: CheckSummaryStatus;
}

function StatusChip({ status }: StatusChipProps) {
  switch (status) {
    case "ok":
      return <Chip color="green" size="xs" label="OK" />;
    case "alert":
      return <Chip color="rose" size="xs" label="Alert" />;
    case "no-data":
      return <Chip color="info" size="xs" label="No Data" />;
    default:
      return <Chip color="info" size="xs" label="Unknown" />;
  }
}

interface HistoryStatusChipProps {
  status: CheckHistoryRun["status"];
}

function HistoryStatusChip({ status }: HistoryStatusChipProps) {
  switch (status) {
    case "success":
      return <Chip color="green" size="xs" label="Success" />;
    case "failure":
      return <Chip color="rose" size="xs" label="Failed" />;
    case "skipped":
      return <Chip color="info" size="xs" label="Skipped" />;
    case "running":
      return <Chip color="warning" size="xs" label="Running" />;
    default:
      return <Chip color="info" size="xs" label="Unknown" />;
  }
}

interface ActionLinksListProps {
  links: ActionLink[];
}

function ActionLinksList({ links }: ActionLinksListProps) {
  const [showAll, setShowAll] = useState(false);
  const MAX_VISIBLE = 5;

  if (links.length === 0) {
    return null;
  }

  const visibleLinks = showAll ? links : links.slice(0, MAX_VISIBLE);
  const hiddenCount = links.length - MAX_VISIBLE;

  return (
    <div className="space-y-1">
      <div
        className={
          showAll && links.length > MAX_VISIBLE
            ? "max-h-48 overflow-y-auto"
            : ""
        }
      >
        {visibleLinks.map((link, idx) => (
          <div key={idx}>
            {link.url === "#" ? (
              <span className="text-sm text-gray-500 dark:text-muted-foreground-night">
                {link.label}
              </span>
            ) : (
              <Link
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {link.label}
              </Link>
            )}
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          {showAll ? "Show less" : `Show ${hiddenCount} more...`}
        </button>
      )}
    </div>
  );
}

function getStatusCardClasses(status: CheckSummaryStatus): string {
  switch (status) {
    case "alert":
      return "border-red-200 bg-red-50 dark:border-warning-500 dark:bg-warning-900/20";
    case "ok":
      return "border-green-200 bg-green-50 dark:border-success-500 dark:bg-success-900/20";
    case "no-data":
    default:
      return "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-muted-background-night";
  }
}

function getDatadogLogsUrl(checkName: string): string {
  const now = Date.now();
  const from = now - 24 * 60 * 60 * 1000;
  return `https://app.datadoghq.eu/logs?query=%40checkName%3A${encodeURIComponent(checkName)}&from_ts=${from}&to_ts=${now}&live=true`;
}

interface HistoryRunRowProps {
  run: CheckHistoryRun;
}

function HistoryRunRow({ run }: HistoryRunRowProps) {
  const [expanded, setExpanded] = useState(false);
  const links = run.actionLinks;
  const hasDetails =
    run.errorMessage !== null || links.length > 0 || run.payload !== null;

  const timestamp = new Date(run.timestamp);

  return (
    <div className="border-b border-gray-100 py-2 last:border-b-0 dark:border-gray-700">
      <div
        className={`flex items-center justify-between ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {hasDetails && (
            <span className="text-gray-400 dark:text-gray-500">
              {expanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </span>
          )}
          <span className="text-sm text-gray-600 dark:text-muted-foreground-night">
            {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString()}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({run.workflowType})
          </span>
        </div>
        <HistoryStatusChip status={run.status} />
      </div>
      {expanded && (
        <div className="ml-6 mt-2 space-y-2">
          {run.errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {run.errorMessage}
            </p>
          )}
          <ActionLinksList links={links} />
          {run.payload !== null && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-gray-500 dark:text-muted-foreground-night">
                Raw payload
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
                {JSON.stringify(run.payload, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

interface PastRunsSectionProps {
  checkName: string;
}

function PastRunsSection({ checkName }: PastRunsSectionProps) {
  const { runs, isCheckHistoryLoading } = usePokeCheckHistory(checkName, true);

  if (isCheckHistoryLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-muted-foreground-night">
        No past runs found.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {runs.map((run) => (
        <HistoryRunRow key={`${run.workflowId}-${run.runId}`} run={run} />
      ))}
    </div>
  );
}

interface ProductionCheckCardProps {
  check: CheckSummary;
  onRun: () => void;
  isRunning: boolean;
}

function ProductionCheckCard({
  check,
  onRun,
  isRunning,
}: ProductionCheckCardProps) {
  const [expanded, setExpanded] = useState(false);
  const links = check.lastRun?.actionLinks ?? [];

  const lastRunDate = check.lastRun ? new Date(check.lastRun.timestamp) : null;

  return (
    <div
      className={`rounded-lg border p-4 ${getStatusCardClasses(check.status)}`}
    >
      <div
        className="flex cursor-pointer items-center justify-between gap-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-400 dark:text-gray-500">
            {expanded ? (
              <ChevronDownIcon className="h-5 w-5" />
            ) : (
              <ChevronRightIcon className="h-5 w-5" />
            )}
          </span>
          <StatusChip status={check.status} />
          <div>
            <div className="break-all font-mono text-sm font-medium">
              {check.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-muted-foreground-night">
              {lastRunDate
                ? `Last run: ${lastRunDate.toLocaleDateString()} ${lastRunDate.toLocaleTimeString()}`
                : "Never run"}
              {" • "}
              Every {check.everyHour} hour{check.everyHour > 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="xs"
          icon={isRunning ? Spinner : PlayIcon}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onRun();
          }}
          disabled={isRunning}
          label={isRunning ? "Running..." : "Run"}
        />
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          {check.status === "alert" && (
            <div className="flex items-center gap-2">
              <a
                href={getDatadogLogsUrl(check.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-purple-600 hover:underline dark:text-purple-400"
              >
                View logs in Datadog →
              </a>
            </div>
          )}

          {check.status === "alert" && links.length > 0 && (
            <div className="rounded-md bg-white p-3 dark:bg-background-night">
              <h4 className="mb-2 text-sm font-medium text-red-800 dark:text-red-400">
                Action Items
              </h4>
              <ActionLinksList links={links} />
              {check.lastRun?.errorMessage && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {check.lastRun.errorMessage}
                </p>
              )}
            </div>
          )}

          {check.status === "alert" &&
            check.lastRun?.errorMessage &&
            links.length === 0 && (
              <div className="rounded-md bg-white p-3 dark:bg-background-night">
                <h4 className="mb-2 text-sm font-medium text-red-800 dark:text-red-400">
                  Error
                </h4>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {check.lastRun.errorMessage}
                </p>
              </div>
            )}

          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-muted-foreground-night">
              Past Runs
            </h4>
            <div className="rounded-md bg-white p-3 dark:bg-background-night">
              <PastRunsSection checkName={check.name} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ProductionChecksPage = () => {
  const { checks, isProductionChecksLoading, mutateProductionChecks } =
    usePokeProductionChecks();
  const [runningChecks, setRunningChecks] = useState<Set<string>>(new Set());
  const sendNotification = useSendNotification();

  const handleRunCheck = async (checkName: string) => {
    setRunningChecks((prev) => new Set(prev).add(checkName));

    try {
      const res = await clientFetch("/api/poke/production-checks/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkName }),
      });

      if (res.ok) {
        sendNotification({
          title: "Check started",
          description: `${checkName} has been triggered`,
          type: "success",
        });
        setTimeout(() => {
          void mutateProductionChecks();
        }, 2000);
      } else {
        const errorData = await res.json();
        sendNotification({
          title: "Failed to start check",
          description: errorData.error?.message ?? "Unknown error",
          type: "error",
        });
      }
    } catch {
      sendNotification({
        title: "Failed to start check",
        description: "Network error",
        type: "error",
      });
    } finally {
      setRunningChecks((prev) => {
        const next = new Set(prev);
        next.delete(checkName);
        return next;
      });
    }
  };

  const alertCount = checks.filter((c) => c.status === "alert").length;

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground-night">
              Production Checks
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-muted-foreground-night">
              {alertCount > 0
                ? `${alertCount} check${alertCount > 1 ? "s" : ""} need${alertCount === 1 ? "s" : ""} attention`
                : "All checks passing"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutateProductionChecks()}
            label="Refresh"
          />
        </div>

        {isProductionChecksLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            {checks.map((check) => (
              <ProductionCheckCard
                key={check.name}
                check={check}
                onRun={() => handleRunCheck(check.name)}
                isRunning={runningChecks.has(check.name)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
};

ProductionChecksPage.getLayout = (page: ReactElement) => {
  return <PokeLayout title="Production Checks">{page}</PokeLayout>;
};

export default ProductionChecksPage;
