import { Spinner, Tooltip } from "@dust-tt/sparkle";

import { WebhookRequestStatusBadge } from "@app/components/agent_builder/triggers/WebhookRequestStatusBadge";
import { usePokeTriggerExecutionStats } from "@app/poke/swr/trigger_execution_stats";
import { WEBHOOK_REQUEST_TRIGGER_STATUSES } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";

interface ExecutionStatsProps {
  owner: LightWorkspaceType;
  triggerId: string;
}

export function ExecutionStats({ owner, triggerId }: ExecutionStatsProps) {
  const { data, isLoading, isError } = usePokeTriggerExecutionStats({
    owner,
    triggerId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="border-material-200 flex flex-col rounded-lg border p-4">
        <h2 className="text-md pb-4 font-bold">Execution Stats</h2>
        <div className="flex items-center justify-center py-4">
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="border-material-200 flex flex-col rounded-lg border p-4">
        <h2 className="text-md pb-4 font-bold">Execution Stats</h2>
        <p className="text-sm text-muted-foreground">
          Error loading execution stats.
        </p>
      </div>
    );
  }

  const maxDailyCount = Math.max(
    ...data.dailyVolume.map(
      (d) => d.succeeded + d.failed + d.notMatched + d.rateLimited
    ),
    1
  );

  return (
    <div className="border-material-200 flex flex-col rounded-lg border p-4">
      <h2 className="text-md pb-4 font-bold">Execution Stats</h2>

      {/* Status Breakdown */}
      <div className="mb-4">
        <h3 className="mb-2 text-sm font-semibold">Status Breakdown</h3>
        <div className="flex flex-wrap gap-3">
          {WEBHOOK_REQUEST_TRIGGER_STATUSES.map((status) => {
            const count = data.statusBreakdown[status] ?? 0;
            return (
              <div key={status} className="flex items-center gap-2">
                <WebhookRequestStatusBadge status={status} />
                <span className="text-sm font-medium">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Volume */}
      {data.dailyVolume.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Daily Volume (Last 30 Days)
          </h3>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-sm bg-success-400" />
              <span>Succeeded</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-sm bg-warning-400" />
              <span>Failed / Rate limited</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2.5 w-2.5 rounded-sm bg-yellow-400" />
              <span>Not matched</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {data.dailyVolume.map((day) => {
              const total =
                day.succeeded + day.failed + day.notMatched + day.rateLimited;
              const barWidth = (total / maxDailyCount) * 100;

              return (
                <div key={day.date} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground">
                    {day.date}
                  </span>
                  <div className="flex-1">
                    <div
                      className="flex h-4 overflow-hidden rounded"
                      style={{
                        width: `${barWidth}%`,
                        minWidth: total > 0 ? "4px" : "0px",
                      }}
                    >
                      {day.succeeded > 0 && (
                        <Tooltip
                          tooltipTriggerAsChild
                          label={`Succeeded: ${day.succeeded}`}
                          trigger={
                            <div
                              className="h-full bg-success-400"
                              style={{
                                width: `${(day.succeeded / total) * 100}%`,
                              }}
                            />
                          }
                        />
                      )}
                      {day.failed + day.rateLimited > 0 && (
                        <Tooltip
                          tooltipTriggerAsChild
                          label={`Failed: ${day.failed}, Rate limited: ${day.rateLimited}`}
                          trigger={
                            <div
                              className="h-full bg-warning-400"
                              style={{
                                width: `${((day.failed + day.rateLimited) / total) * 100}%`,
                              }}
                            />
                          }
                        />
                      )}
                      {day.notMatched > 0 && (
                        <Tooltip
                          tooltipTriggerAsChild
                          label={`Not matched: ${day.notMatched}`}
                          trigger={
                            <div
                              className="h-full bg-yellow-400"
                              style={{
                                width: `${(day.notMatched / total) * 100}%`,
                              }}
                            />
                          }
                        />
                      )}
                    </div>
                  </div>
                  <span className="w-8 text-right font-medium">{total}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
