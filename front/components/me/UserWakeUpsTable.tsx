import type { UserWakeUpWithConversation } from "@app/lib/api/assistant/wakeups";
import { useAppRouter } from "@app/lib/platform";
import { useUserWakeUps } from "@app/lib/swr/wakeups";
import { getConversationRoute } from "@app/lib/utils/router";
import {
  describeWakeUpSchedule,
  getNextWakeUpFireAtFromScheduleConfig,
} from "@app/lib/utils/wakeup_description";
import type { UserWakeUpType } from "@app/types/assistant/wakeups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import { DataTable, Spinner, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useMemo, useState } from "react";

const WAKE_UPS_PAGE_SIZE = 10;

function formatSchedule(wakeUp: UserWakeUpType): string {
  switch (wakeUp.scheduleConfig.type) {
    case "one_shot":
      // `describeWakeUpSchedule` renders a one-shot as its time of day alone ("at 11:06"), which cannot
      // be told apart from another day's 11:06 and only repeats what the "Next" column already shows.
      // Here the column answers "does this repeat?" instead.
      return "once";
    case "cron":
      return describeWakeUpSchedule(wakeUp);
    default:
      assertNeverAndIgnore(wakeUp.scheduleConfig);
      return "";
  }
}

type WakeUpRowData = UserWakeUpWithConversation & {
  onClick: () => void;
};

const COLUMNS: ColumnDef<WakeUpRowData>[] = [
  {
    id: "conversation",
    header: "Conversation",
    enableSorting: false,
    meta: { className: "w-[30%] truncate", headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start text-left">
        <span className="truncate text-sm font-semibold">
          {info.row.original.conversation.title ?? "Untitled conversation"}
        </span>
      </DataTable.CellContent>
    ),
  },
  {
    id: "reason",
    header: "Reason",
    enableSorting: false,
    meta: { className: "w-[30%] truncate", headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start text-left">
        <Tooltip
          label={info.row.original.wakeUp.reason}
          tooltipTriggerAsChild
          trigger={
            <span className="truncate text-sm">
              {info.row.original.wakeUp.reason}
            </span>
          }
        />
      </DataTable.CellContent>
    ),
  },
  {
    id: "schedule",
    header: "Schedule kind",
    enableSorting: false,
    meta: { className: "w-[20%] truncate", headerAlign: "left" },
    cell: (info) => (
      <DataTable.CellContent className="w-full justify-start text-left">
        <span className="truncate text-sm text-muted-foreground">
          {formatSchedule(info.row.original.wakeUp)}
        </span>
      </DataTable.CellContent>
    ),
  },
  {
    id: "nextFire",
    header: "Next",
    enableSorting: false,
    meta: { className: "w-[20%] truncate", headerAlign: "left" },
    cell: (info) => {
      // The endpoint only lists active wake-ups, so every row still has a firing ahead of it —
      // unless the stored cron no longer parses.
      const nextFireAt = getNextWakeUpFireAtFromScheduleConfig(
        info.row.original.wakeUp.scheduleConfig
      );

      return (
        <DataTable.CellContent className="w-full justify-start text-left">
          <span className="truncate text-sm tabular-nums text-muted-foreground">
            {nextFireAt !== null
              ? new Date(nextFireAt).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "—"}
          </span>
        </DataTable.CellContent>
      );
    },
  },
];

interface UserWakeUpsTableProps {
  owner: LightWorkspaceType;
  // Called before navigating away, so the host dialog closes instead of
  // staying open on top of the conversation.
  onNavigate: () => void;
}

export function UserWakeUpsTable({ owner, onNavigate }: UserWakeUpsTableProps) {
  const router = useAppRouter();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: WAKE_UPS_PAGE_SIZE,
  });

  const { wakeUps, totalCount, isWakeUpsLoading, isWakeUpsError } =
    useUserWakeUps({
      owner,
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
    });

  const rows: WakeUpRowData[] = useMemo(
    () =>
      wakeUps.map((wakeUp) => ({
        ...wakeUp,
        onClick: () => {
          onNavigate();
          void router.push(
            getConversationRoute(owner.sId, wakeUp.conversation.sId)
          );
        },
      })),
    [wakeUps, onNavigate, router, owner.sId]
  );

  if (isWakeUpsError) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Failed to load your wake-ups.
      </div>
    );
  }

  if (isWakeUpsLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner variant="dark" size="md" />
      </div>
    );
  }

  if (wakeUps.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        None of your conversations has a scheduled wake-up. Agents schedule
        wake-ups to pick a conversation back up on their own.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <DataTable
        data={rows}
        columns={COLUMNS}
        totalRowCount={totalCount}
        pagination={pagination}
        setPagination={setPagination}
      />
    </div>
  );
}
