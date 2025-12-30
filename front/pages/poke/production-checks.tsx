import {
  Button,
  Chip,
  CollapsibleComponent,
  PlayIcon,
  Spinner,
} from "@dust-tt/sparkle";
import Link from "next/link";
import type { ComponentProps, ReactElement } from "react";
import React, { useState } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import {
  usePokeCheckHistory,
  usePokeProductionChecks,
  useRunProductionCheck,
} from "@app/hooks/usePokeProductionChecks";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import type {
  ActionLink,
  CheckHistoryRun,
  CheckSummary,
  CheckSummaryStatus,
} from "@app/types";
import { conjugate, pluralize } from "@app/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_VISIBLE = 5;

const STATUS_CHIP_CONFIG: Record<
  CheckSummaryStatus,
  { color: ComponentProps<typeof Chip>["color"]; label: string }
> = {
  ok: { color: "green", label: "OK" },
  alert: { color: "rose", label: "Alert" },
  "no-data": { color: "info", label: "No Data" },
};

const HISTORY_STATUS_CHIP_CONFIG: Record<
  CheckHistoryRun["status"],
  { color: ComponentProps<typeof Chip>["color"]; label: string }
> = {
  success: { color: "green", label: "Success" },
  failure: { color: "rose", label: "Failed" },
  skipped: { color: "info", label: "Skipped" },
  running: { color: "warning", label: "Running" },
};

const STATUS_CARD_CLASSES: Record<CheckSummaryStatus, string> = {
  alert:
    "border-red-200 bg-red-50 dark:border-warning-500 dark:bg-warning-900/20",
  ok: "border-green-200 bg-green-50 dark:border-success-500 dark:bg-success-900/20",
  "no-data":
    "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-muted-background-night",
};

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
  const config = STATUS_CHIP_CONFIG[status] ?? {
    color: "info",
    label: "Unknown",
  };
  return <Chip color={config.color} size="xs" label={config.label} />;
}

interface HistoryStatusChipProps {
  status: CheckHistoryRun["status"];
}

function HistoryStatusChip({ status }: HistoryStatusChipProps) {
  const config = HISTORY_STATUS_CHIP_CONFIG[status] ?? {
    color: "info",
    label: "Unknown",
  };
  return <Chip color={config.color} size="xs" label={config.label} />;
}

interface ActionLinksListProps {
  links: ActionLink[];
}

function ActionLinksList({ links }: ActionLinksListProps) {
  const [showAll, setShowAll] = useState(false);

  if (links.length === 0) {
    return null;
  }

  const visibleLinks = showAll ? links : links.slice(0, MAX_VISIBLE);
  const hiddenCount = links.length - MAX_VISIBLE;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          showAll && links.length > MAX_VISIBLE && "max-h-48 overflow-y-auto"
        )}
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
        <Button
          variant="ghost"
          size="xs"
          label={showAll ? "Show less" : `Show ${hiddenCount} more...`}
          onClick={() => setShowAll(!showAll)}
        />
      )}
    </div>
  );
}

function getStatusCardClasses(status: CheckSummaryStatus): string {
  return STATUS_CARD_CLASSES[status] ?? STATUS_CARD_CLASSES["no-data"];
}

function getDatadogLogsUrl(checkName: string): string {
  const nowMs = Date.now();
  const fromMs = nowMs - ONE_DAY_MS;
  return `https://app.datadoghq.eu/logs?query=%40checkName%3A${encodeURIComponent(checkName)}&from_ts=${fromMs}&to_ts=${nowMs}&live=true`;
}

interface HistoryRunRowProps {
  run: CheckHistoryRun;
}

function HistoryRunRow({ run }: HistoryRunRowProps) {
  const links = run.actionLinks;
  const hasDetails =
    run.errorMessage !== null || links.length > 0 || run.payload !== null;

  const timestamp = new Date(run.timestamp);

  const rowContent = (
    <>
      <div className="flex flex-1 items-center gap-2">
        <span className="text-sm font-medium text-gray-600 dark:text-muted-foreground-night">
          {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString()}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          ({run.workflowType})
        </span>
      </div>
      <HistoryStatusChip status={run.status} />
    </>
  );

  const detailsContent = (
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
  );

  if (!hasDetails) {
    return <div className="flex items-center gap-3">{rowContent}</div>;
  }

  return (
    <CollapsibleComponent
      rootProps={{ defaultOpen: false }}
      triggerProps={{ className: "gap-3" }}
      triggerChildren={rowContent}
      contentChildren={detailsContent}
    />
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
    <div className="space-y-3">
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
  const links = check.lastRun?.actionLinks ?? [];

  const lastRunDate = check.lastRun ? new Date(check.lastRun.timestamp) : null;

  const triggerContent = (
    <>
      <StatusChip status={check.status} />
      <div className="min-w-0 flex-1 text-left">
        <div className="break-all font-mono text-sm font-medium">
          {check.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-muted-foreground-night">
          {lastRunDate
            ? `Last run: ${lastRunDate.toLocaleDateString()} ${lastRunDate.toLocaleTimeString()}`
            : "Never run"}
          {" • "}
          Every {check.everyHour} hour{pluralize(check.everyHour)}
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
    </>
  );

  const detailsContent = (
    <div className="mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
      {check.status === "alert" && (
        <div className="flex items-center gap-2">
          <Link
            href={getDatadogLogsUrl(check.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-purple-600 hover:underline dark:text-purple-400"
          >
            View logs in Datadog →
          </Link>
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
  );

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        getStatusCardClasses(check.status)
      )}
    >
      <CollapsibleComponent
        rootProps={{ defaultOpen: false }}
        triggerProps={{ className: "gap-3" }}
        triggerChildren={triggerContent}
        contentChildren={detailsContent}
      />
    </div>
  );
}

const ProductionChecksPage = () => {
  const { checks, isProductionChecksLoading, mutateProductionChecks } =
    usePokeProductionChecks();
  const { runCheck, isCheckRunning } = useRunProductionCheck();

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
                ? `${alertCount} check${pluralize(alertCount)} need${conjugate(alertCount)} attention`
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
                onRun={() => runCheck(check.name)}
                isRunning={isCheckRunning(check.name)}
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
