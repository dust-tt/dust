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
  Chip,
  ClockIcon,
  CloudArrowDownIcon,
  DataTable,
  Page,
  Separator,
  Spinner,
  TrashIcon,
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

// -- Run history table --

type RunRowData = {
  sId: string;
  status: string;
  startedAt: number;
  completedAt: number | null;
  errorMessage: string | null;
  conversationSId: string | null;
  onClick?: () => void;
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

// -- Trigger overview --

interface TriggerOverviewProps {
  trigger: TriggerDetailType;
}

function TriggerOverview({ trigger }: TriggerOverviewProps) {
  const KindIcon = getKindIcon(trigger.kind);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar visual={trigger.agentPictureUrl} size="md" icon={BoltIcon} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            @{trigger.agentName ?? "Unknown agent"}
          </span>
          <span className="text-sm text-muted-foreground">
            Created by {trigger.editorName ?? "unknown"} ·{" "}
            {formatTimestampToFriendlyDate(trigger.createdAt, "compact")}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Chip size="sm" color="info" icon={KindIcon}>
            {getKindLabel(trigger.kind)}
          </Chip>
          {getStatusChip(trigger.status)}
        </div>
      </div>
    </div>
  );
}

// -- Configuration section --

interface TriggerConfigSectionProps {
  trigger: TriggerDetailType;
}

function TriggerConfigSection({ trigger }: TriggerConfigSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <Page.SectionHeader title="Configuration" />
      <div className="flex flex-col gap-2">
        {trigger.kind === "schedule" && (
          <>
            <div className="flex items-baseline gap-3">
              <span className="w-32 shrink-0 text-sm text-muted-foreground">
                Schedule
              </span>
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                {trigger.configuration.cron}
              </code>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="w-32 shrink-0 text-sm text-muted-foreground">
                Timezone
              </span>
              <span className="text-sm">
                {"timezone" in trigger.configuration
                  ? trigger.configuration.timezone
                  : "UTC"}
              </span>
            </div>
          </>
        )}
        {trigger.kind === "webhook" && (
          <>
            {"event" in trigger.configuration &&
              trigger.configuration.event && (
                <div className="flex items-baseline gap-3">
                  <span className="w-32 shrink-0 text-sm text-muted-foreground">
                    Event
                  </span>
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {trigger.configuration.event}
                  </code>
                </div>
              )}
            {"filter" in trigger.configuration &&
              trigger.configuration.filter && (
                <div className="flex items-baseline gap-3">
                  <span className="w-32 shrink-0 text-sm text-muted-foreground">
                    Filter
                  </span>
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {trigger.configuration.filter}
                  </code>
                </div>
              )}
            {"includePayload" in trigger.configuration && (
              <div className="flex items-baseline gap-3">
                <span className="w-32 shrink-0 text-sm text-muted-foreground">
                  Include payload
                </span>
                <span className="text-sm">
                  {trigger.configuration.includePayload ? "Yes" : "No"}
                </span>
              </div>
            )}
          </>
        )}
        {trigger.customPrompt && (
          <div className="flex items-baseline gap-3">
            <span className="w-32 shrink-0 text-sm text-muted-foreground">
              Message
            </span>
            <p className="whitespace-pre-wrap text-sm">
              {trigger.customPrompt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Run history section --

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
      <Page.SectionHeader
        title="Run History"
        description={totalCount > 0 ? `${totalCount} total runs` : undefined}
      />
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : runRows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No runs recorded yet.
        </p>
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
      <Page.SectionHeader
        title="Subscribers"
        description={
          subscribers.length > 0
            ? `${subscribers.length} subscriber${subscribers.length > 1 ? "s" : ""}`
            : undefined
        }
      />
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : subscribers.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No subscribers yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {subscribers.map((sub) => (
            <div key={sub.sId} className="flex items-center gap-3 py-1.5">
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
        <TriggerOverview trigger={trigger} />

        <Separator />

        <TriggerConfigSection trigger={trigger} />

        <Separator />

        <RunHistorySection
          workspaceId={owner.sId}
          runs={runs}
          totalCount={totalCount}
          isLoading={isRunsLoading}
          runsLimit={runsLimit}
          runsOffset={runsOffset}
          onOffsetChange={setRunsOffset}
        />

        <Separator />

        <SubscribersSection
          subscribers={subscribers}
          isLoading={isSubscribersLoading}
        />
      </Page.Vertical>
    </div>
  );
}
