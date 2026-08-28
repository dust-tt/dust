import { cn } from "@app/components/poke/shadcn/lib/utils";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  usePokeCheckHistory,
  usePokeProductionChecks,
  useRunProductionCheck,
} from "@app/hooks/usePokeProductionChecks";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import type {
  ActionLink,
  CheckFailurePayload,
  CheckHistoryRun,
  CheckSummary,
  CheckSummaryStatus,
} from "@app/types/production_checks";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { conjugate, pluralize } from "@app/types/shared/utils/string_utils";
import {
  Button,
  Chip,
  Clipboard,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  LinkWrapper,
  Play,
  Spinner,
} from "@dust-tt/sparkle";
import type React from "react";
import type { ComponentProps } from "react";
import { useCallback, useMemo, useState } from "react";

const MAX_VISIBLE = 5;

const STATUS_CHIP_CONFIG: Record<
  CheckSummaryStatus,
  { color: ComponentProps<typeof Chip>["color"]; label: string }
> = {
  ok: { color: "success", label: "OK" },
  alert: { color: "warning", label: "Alert" },
  "no-data": { color: "info", label: "No Data" },
};

const HISTORY_STATUS_CHIP_CONFIG: Record<
  CheckHistoryRun["status"],
  { color: ComponentProps<typeof Chip>["color"]; label: string }
> = {
  success: { color: "success", label: "Success" },
  failure: { color: "warning", label: "Failed" },
  skipped: { color: "info", label: "Skipped" },
  running: { color: "highlight", label: "Running" },
};

const STATUS_CARD_CLASSES: Record<CheckSummaryStatus, string> = {
  alert: "border-warning-200 bg-warning-50",
  ok: "border-success-200 bg-success-50",
  "no-data": "border-primary-200 bg-primary-50",
};

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

function isCheckFailurePayload(item: unknown): item is CheckFailurePayload {
  return (
    typeof item === "object" &&
    item !== null &&
    "actionLinks" in item &&
    Array.isArray(item.actionLinks)
  );
}

interface ActionLinksListProps {
  payload: unknown;
  links: ActionLink[];
  checkName: string;
}

function ActionLinksList({ payload, links, checkName }: ActionLinksListProps) {
  const [showAll, setShowAll] = useState(false);
  const sendNotification = useSendNotification();

  const isGdriveCheck = checkName === "managed_data_source_gdrive_gc";

  const groupedItems = useMemo(() => {
    if (!Array.isArray(payload)) {
      return null;
    }

    const groups = new Map<string, CheckFailurePayload[]>();
    for (const item of payload) {
      if (!isCheckFailurePayload(item)) {
        continue;
      }
      const errorMsg = item.errorMessage ?? "Unknown error";
      const existing = groups.get(errorMsg) ?? [];
      existing.push(item);
      groups.set(errorMsg, existing);
    }
    return groups;
  }, [payload]);

  const handleCopyDocumentIds = useCallback(
    async (item: CheckFailurePayload) => {
      const notDeleted = item.notDeleted;
      if (Array.isArray(notDeleted)) {
        try {
          await navigator.clipboard.writeText(notDeleted.join("\n"));
          sendNotification({
            title: "Copied",
            description: "Document IDs copied to clipboard",
            type: "success",
          });
        } catch {
          sendNotification({
            title: "Failed to copy",
            description: "Could not copy to clipboard",
            type: "error",
          });
        }
      }
    },
    [sendNotification]
  );

  const renderActionLink = (link: ActionLink, item?: CheckFailurePayload) => (
    <div className="flex items-center gap-2">
      {link.url === "#" ? (
        <span className="text-sm text-primary-500">{link.label}</span>
      ) : (
        <LinkWrapper
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-highlight-600 hover:underline"
        >
          {link.label}
        </LinkWrapper>
      )}
      {isGdriveCheck && item && Array.isArray(item.notDeleted) && (
        <Button
          variant="ghost"
          size="xs"
          icon={Clipboard}
          onClick={() => handleCopyDocumentIds(item)}
          tooltip="Copy document IDs"
        />
      )}
    </div>
  );

  // Grouped view when payload is an array
  if (groupedItems && groupedItems.size > 0) {
    const totalItems = Array.from(groupedItems.values()).reduce(
      (acc, items) => acc + items.length,
      0
    );
    const hiddenCount = totalItems - MAX_VISIBLE;
    let itemsRendered = 0;

    return (
      <div className="space-y-3">
        <div
          className={cn(
            showAll && totalItems > MAX_VISIBLE && "h-96 overflow-y-scroll"
          )}
        >
          {Array.from(groupedItems.entries()).map(([errorMsg, items]) => {
            const itemsToRender: {
              item: CheckFailurePayload;
              link: ActionLink;
            }[] = [];

            for (const item of items) {
              for (const link of item.actionLinks) {
                if (!showAll && itemsRendered >= MAX_VISIBLE) {
                  break;
                }
                itemsToRender.push({ item, link });
                itemsRendered++;
              }
              if (!showAll && itemsRendered >= MAX_VISIBLE) {
                break;
              }
            }

            if (itemsToRender.length === 0) {
              return null;
            }

            return (
              <div key={errorMsg} className="space-y-1">
                <p className="text-sm text-primary-500">{errorMsg}:</p>
                <div className="ml-4 space-y-1">
                  {itemsToRender.map(({ item, link }, idx) => (
                    <div key={idx}>{renderActionLink(link, item)}</div>
                  ))}
                </div>
              </div>
            );
          })}
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

  // Flat view when no payload array (fallback to links)
  if (links.length === 0) {
    return null;
  }

  const visibleLinks = showAll ? links : links.slice(0, MAX_VISIBLE);
  const hiddenCount = links.length - MAX_VISIBLE;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          showAll && links.length > MAX_VISIBLE && "h-96 overflow-y-scroll"
        )}
      >
        {visibleLinks.map((link, idx) => (
          <div key={idx}>{renderActionLink(link)}</div>
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
  checkName: string;
}

function HistoryRunRow({ run, checkName }: HistoryRunRowProps) {
  const links = run.actionLinks;
  const hasDetails =
    run.errorMessage !== null || links.length > 0 || run.payload !== null;

  const timestamp = new Date(run.timestamp);

  const rowContent = (
    <>
      <div className="flex flex-1 items-center gap-2">
        <span className="text-sm font-medium text-primary-600">
          {timestamp.toLocaleDateString()} {timestamp.toLocaleTimeString()}
        </span>
        <span className="text-xs text-primary-400">({run.workflowType})</span>
      </div>
      <HistoryStatusChip status={run.status} />
    </>
  );

  const detailsContent = (
    <div className="ml-6 mt-2 space-y-2">
      {run.errorMessage && (
        <p className="text-sm text-warning-600">{run.errorMessage}</p>
      )}
      <ActionLinksList
        payload={run.payload}
        links={links}
        checkName={checkName}
      />
      {run.payload !== null && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-primary-500">
            Raw payload
          </summary>
          <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-primary-100 p-2 text-xs">
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
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="gap-3">{rowContent}</CollapsibleTrigger>
      <CollapsibleContent>{detailsContent}</CollapsibleContent>
    </Collapsible>
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
    return <p className="text-sm text-primary-500">No past runs found.</p>;
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <HistoryRunRow
          key={`${run.workflowId}-${run.runId}`}
          run={run}
          checkName={checkName}
        />
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
        <div className="text-xs text-primary-500">
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
        icon={isRunning ? Spinner : Play}
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
    <div className="mt-4 space-y-4 border-t border-primary-200 pt-4">
      <div className="flex items-center gap-2">
        <LinkWrapper
          href={getDatadogLogsUrl(check.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-highlight-600 hover:underline"
        >
          View logs in Datadog →
        </LinkWrapper>
      </div>

      {check.status === "alert" &&
        (Array.isArray(check.lastRun?.payload) || links.length > 0) && (
          <div className="rounded-md bg-background p-3">
            <h4 className="mb-2 text-sm font-medium text-warning-800">
              Action Items
            </h4>
            <ActionLinksList
              payload={check.lastRun?.payload}
              links={links}
              checkName={check.name}
            />
          </div>
        )}

      {check.status === "alert" &&
        check.lastRun?.errorMessage &&
        !Array.isArray(check.lastRun?.payload) &&
        links.length === 0 && (
          <div className="rounded-md bg-background p-3">
            <h4 className="mb-2 text-sm font-medium text-warning-800">Error</h4>
            <p className="text-sm text-warning-600">
              {check.lastRun.errorMessage}
            </p>
          </div>
        )}

      <div>
        <h4 className="mb-2 text-sm font-medium text-primary-700">Past Runs</h4>
        <div className="rounded-md bg-background p-3">
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
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="gap-3">
          {triggerContent}
        </CollapsibleTrigger>
        <CollapsibleContent>{detailsContent}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function ProductionChecksPage() {
  usePokePageMetadata({ name: "Production Checks" });

  const { checks, isProductionChecksLoading, mutateProductionChecks } =
    usePokeProductionChecks();
  const { runCheck, isCheckRunning } = useRunProductionCheck();

  const alertCount = checks.filter((c) => c.status === "alert").length;

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="py-8">
        <div className="mb-8 flex items-center justify-between gap-x-2">
          <div>
            <h1 className="text-2xl font-bold text-primary-900">
              Production Checks
            </h1>
            {!isProductionChecksLoading && (
              <p className="mt-1 text-sm text-primary-600">
                {alertCount > 0
                  ? `${alertCount} check${pluralize(alertCount)} need${conjugate(alertCount)} attention`
                  : "All checks passing"}
              </p>
            )}
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
}
