import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import {
  useSetContentWidth,
  useSetNavChildren,
} from "@app/components/sparkle/AppLayoutContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import {
  useTriggerDetail,
  useTriggerRuns,
  useTriggerSubscribers,
} from "@app/lib/swr/agent_triggers";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import {
  getConversationRoute,
  getManageTriggersRoute,
} from "@app/lib/utils/router";
import type { TriggerDetailType } from "@app/pages/api/w/[wId]/triggers/[tId]";
import type { TriggerRunType } from "@app/types/assistant/triggers";
import {
  ArrowLeftIcon,
  Avatar,
  BoltIcon,
  Button,
  CardGrid,
  Chip,
  ClockIcon,
  CloudArrowDownIcon,
  DataTable,
  Page,
  Spinner,
  TrashIcon,
  ValueCard,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

function getKindLabel(kind: string) {
  switch (kind) {
    case "schedule":
      return "Schedule";
    case "webhook":
      return "Webhook";
    default:
      return kind;
  }
}

function getKindIcon(kind: string) {
  switch (kind) {
    case "schedule":
      return ClockIcon;
    case "webhook":
      return CloudArrowDownIcon;
    default:
      return BoltIcon;
  }
}

function getStatusChip(status: string) {
  switch (status) {
    case "enabled":
      return (
        <Chip size="sm" color="success">
          Enabled
        </Chip>
      );
    case "disabled":
      return (
        <Chip size="sm" color="primary">
          Disabled
        </Chip>
      );
    case "downgraded":
      return (
        <Chip size="sm" color="warning">
          Downgraded
        </Chip>
      );
    default:
      return <Chip size="sm">{status}</Chip>;
  }
}

function getRunStatusChip(status: string) {
  switch (status) {
    case "success":
      return (
        <Chip size="xs" color="success">
          Success
        </Chip>
      );
    case "failure":
      return (
        <Chip size="xs" color="rose">
          Failure
        </Chip>
      );
    case "running":
      return (
        <Chip size="xs" color="info">
          Running
        </Chip>
      );
    default:
      return <Chip size="xs">{status}</Chip>;
  }
}

// -- Overview cards --

interface OverviewCardsProps {
  trigger: TriggerDetailType;
  totalRunCount: number;
  subscriberCount: number;
}

function OverviewCards({
  trigger,
  totalRunCount,
  subscriberCount,
}: OverviewCardsProps) {
  const KindIcon = getKindIcon(trigger.kind);

  return (
    <CardGrid>
      <ValueCard
        title="Agent"
        className="h-24"
        content={
          <div className="flex items-center gap-2">
            <Avatar
              visual={trigger.agentPictureUrl}
              size="xs"
              icon={BoltIcon}
            />
            <span className="truncate font-medium text-foreground dark:text-foreground-night">
              @{trigger.agentName ?? "Unknown"}
            </span>
          </div>
        }
      />
      <ValueCard
        title="Type"
        className="h-24"
        content={
          <div className="flex items-center gap-2">
            <Chip size="sm" color="info" icon={KindIcon}>
              {getKindLabel(trigger.kind)}
            </Chip>
          </div>
        }
      />
      <ValueCard
        title="Status"
        className="h-24"
        content={getStatusChip(trigger.status)}
      />
      <ValueCard
        title="Total runs"
        className="h-24"
        content={
          <span className="text-2xl text-foreground dark:text-foreground-night">
            {totalRunCount.toLocaleString()}
          </span>
        }
      />
    </CardGrid>
  );
}

// -- Configuration section --

interface ConfigurationSectionProps {
  trigger: TriggerDetailType;
}

function ConfigurationSection({ trigger }: ConfigurationSectionProps) {
  const rows: { label: string; value: React.ReactNode }[] = [];

  rows.push({
    label: "Created by",
    value: trigger.editorName ?? "Unknown",
  });

  rows.push({
    label: "Created",
    value: formatTimestampToFriendlyDate(trigger.createdAt, "compact"),
  });

  if (trigger.kind === "schedule") {
    rows.push({
      label: "Schedule",
      value: (
        <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
          {trigger.configuration.cron}
        </code>
      ),
    });
    if ("timezone" in trigger.configuration) {
      rows.push({
        label: "Timezone",
        value: trigger.configuration.timezone,
      });
    }
  }

  if (trigger.kind === "webhook") {
    if ("event" in trigger.configuration && trigger.configuration.event) {
      rows.push({
        label: "Event",
        value: (
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
            {trigger.configuration.event}
          </code>
        ),
      });
    }
    if ("filter" in trigger.configuration && trigger.configuration.filter) {
      rows.push({
        label: "Filter",
        value: (
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
            {trigger.configuration.filter}
          </code>
        ),
      });
    }
    if ("includePayload" in trigger.configuration) {
      rows.push({
        label: "Include payload",
        value: trigger.configuration.includePayload ? "Yes" : "No",
      });
    }
  }

  if (trigger.customPrompt) {
    rows.push({
      label: "Message",
      value: (
        <p className="whitespace-pre-wrap text-sm">{trigger.customPrompt}</p>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Page.SectionHeader title="Configuration" />
      <div className="rounded-lg border border-border p-4">
        <div className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline gap-4 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="w-36 shrink-0 text-sm text-muted-foreground">
                {row.label}
              </span>
              <div className="text-sm">{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// -- Run history table --

type RunRowData = {
  sId: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  errorMessage: string | null;
  conversationSId: string | null;
};

function getRunTableColumns(workspaceId: string) {
  return [
    {
      header: "Timestamp",
      accessorKey: "startedAt" as const,
      cell: (info: CellContext<RunRowData, number>) => (
        <DataTable.BasicCellContent
          label={formatTimestampToFriendlyDate(info.getValue(), "compact")}
        />
      ),
      meta: { className: "w-44" },
    },
    {
      header: "Status",
      accessorKey: "status" as const,
      cell: (info: CellContext<RunRowData, string>) => (
        <DataTable.CellContent>
          {getRunStatusChip(info.getValue())}
        </DataTable.CellContent>
      ),
      meta: { className: "w-28" },
    },
    {
      header: "Conversation",
      accessorKey: "conversationSId" as const,
      cell: (info: CellContext<RunRowData, string | null>) => {
        const conversationSId = info.getValue();
        if (!conversationSId) {
          return (
            <DataTable.BasicCellContent
              label={
                info.row.original.status === "running" ? "In progress..." : "-"
              }
            />
          );
        }
        return (
          <DataTable.CellContent>
            <a
              href={getConversationRoute(workspaceId, conversationSId)}
              className="text-action-500 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View conversation
            </a>
          </DataTable.CellContent>
        );
      },
      meta: { className: "w-44" },
    },
    {
      header: "Error",
      accessorKey: "errorMessage" as const,
      cell: (info: CellContext<RunRowData, string | null>) => {
        const errorMessage = info.getValue();
        if (!errorMessage) {
          return <DataTable.BasicCellContent label="-" />;
        }
        return (
          <DataTable.CellContent>
            <span className="text-warning-500">{errorMessage}</span>
          </DataTable.CellContent>
        );
      },
      meta: { className: "w-full" },
    },
  ];
}

interface RunHistorySectionProps {
  workspaceId: string;
  runs: TriggerRunType[];
  totalCount: number;
  isLoading: boolean;
  runsLimit: number;
  runsOffset: number;
  onOffsetChange: (offset: number) => void;
}

function RunHistorySection({
  workspaceId,
  runs,
  totalCount,
  isLoading,
  runsLimit,
  runsOffset,
  onOffsetChange,
}: RunHistorySectionProps) {
  const runRows: RunRowData[] = useMemo(
    () =>
      runs.map((run) => ({
        sId: run.sId,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        errorMessage: run.errorMessage,
        conversationSId: run.conversationSId,
      })),
    [runs]
  );

  return (
    <div className="flex flex-col gap-3">
      <Page.SectionHeader title="Run History" />
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : runRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border py-8 text-center">
          <ClockIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No runs recorded yet.
          </p>
        </div>
      ) : (
        <>
          <DataTable data={runRows} columns={getRunTableColumns(workspaceId)} />
          {totalCount > runsLimit && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button
                label="Previous"
                variant="outline"
                size="sm"
                disabled={runsOffset === 0}
                onClick={() =>
                  onOffsetChange(Math.max(0, runsOffset - runsLimit))
                }
              />
              <span className="text-sm text-muted-foreground">
                {runsOffset + 1}–{Math.min(runsOffset + runsLimit, totalCount)}{" "}
                of {totalCount}
              </span>
              <Button
                label="Next"
                variant="outline"
                size="sm"
                disabled={runsOffset + runsLimit >= totalCount}
                onClick={() => onOffsetChange(runsOffset + runsLimit)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// -- Subscribers section --

interface SubscribersSectionProps {
  subscribers: { sId: string; fullName: string; image: string | null }[];
  isLoading: boolean;
}

function SubscribersSection({
  subscribers,
  isLoading,
}: SubscribersSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <Page.SectionHeader title="Subscribers" />
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : subscribers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No subscribers yet.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          {subscribers.map((sub, i) => (
            <div
              key={sub.sId}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                i < subscribers.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <Avatar visual={sub.image} size="xs" />
              <span className="text-sm">{sub.fullName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Main page --

export function TriggerDetailPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const { tId } = useParams<{ tId: string }>();
  const router = useAppRouter();
  const [runsOffset, setRunsOffset] = useState(0);
  const runsLimit = 20;

  const { trigger, isTriggerLoading, mutateTrigger } = useTriggerDetail({
    workspaceId: owner.sId,
    triggerId: tId ?? null,
  });

  const { runs, totalCount, isRunsLoading } = useTriggerRuns({
    workspaceId: owner.sId,
    triggerId: tId ?? null,
    limit: runsLimit,
    offset: runsOffset,
  });

  const { subscribers, isSubscribersLoading } = useTriggerSubscribers({
    workspaceId: owner.sId,
    agentConfigurationId: trigger?.agentConfigurationSId ?? null,
    triggerId: tId ?? null,
    disabled: !trigger,
  });

  const handleToggleStatus = useCallback(async () => {
    if (!trigger || !tId) {
      return;
    }

    const newStatus = trigger.status === "enabled" ? "disabled" : "enabled";
    await clientFetch(`/api/w/${owner.sId}/triggers/${tId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trigger.name,
        kind: trigger.kind,
        customPrompt: trigger.customPrompt,
        naturalLanguageDescription: trigger.naturalLanguageDescription,
        configuration: trigger.configuration,
        status: newStatus,
      }),
    });

    void mutateTrigger();
  }, [trigger, tId, owner.sId, mutateTrigger]);

  const handleDelete = useCallback(async () => {
    if (!trigger || !tId) {
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to delete trigger "${trigger.name}"?`
      )
    ) {
      return;
    }

    const response = await clientFetch(`/api/w/${owner.sId}/triggers/${tId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      void router.push(getManageTriggersRoute(owner.sId));
    }
  }, [trigger, tId, owner.sId, router]);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("wide");
  useSetNavChildren(navChildren);

  if (isTriggerLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!trigger) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <p className="text-sm text-muted-foreground">Trigger not found.</p>
        <Button
          label="Back to triggers"
          icon={ArrowLeftIcon}
          variant="outline"
          href={getManageTriggersRoute(owner.sId)}
        />
      </div>
    );
  }

  const KindIcon = getKindIcon(trigger.kind);

  return (
    <div className="flex w-full flex-col gap-8 pb-8 pt-2 lg:pt-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            icon={ArrowLeftIcon}
            variant="ghost"
            size="sm"
            href={getManageTriggersRoute(owner.sId)}
          />
          <Page.Header title={trigger.name} icon={KindIcon} />
        </div>
        {trigger.isEditor && (
          <div className="flex items-center gap-2">
            <Button
              label={trigger.status === "enabled" ? "Disable" : "Enable"}
              variant="outline"
              size="sm"
              onClick={handleToggleStatus}
            />
            <Button
              label="Delete"
              icon={TrashIcon}
              variant="warning"
              size="sm"
              onClick={handleDelete}
            />
          </div>
        )}
      </div>

      <Page.Vertical gap="xl" align="stretch">
        <OverviewCards
          trigger={trigger}
          totalRunCount={totalCount}
          subscriberCount={subscribers.length}
        />

        <ConfigurationSection trigger={trigger} />

        <RunHistorySection
          workspaceId={owner.sId}
          runs={runs}
          totalCount={totalCount}
          isLoading={isRunsLoading}
          runsLimit={runsLimit}
          runsOffset={runsOffset}
          onOffsetChange={setRunsOffset}
        />

        <SubscribersSection
          subscribers={subscribers}
          isLoading={isSubscribersLoading}
        />
      </Page.Vertical>
    </div>
  );
}
