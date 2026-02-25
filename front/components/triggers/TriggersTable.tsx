import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useAppRouter } from "@app/lib/platform";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { getTriggerDetailRoute } from "@app/lib/utils/router";
import type { WorkspaceTriggerType } from "@app/pages/api/w/[wId]/triggers";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Avatar,
  BoltIcon,
  Chip,
  ClockIcon,
  CloudArrowDownIcon,
  DataTable,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import type React from "react";
import { useMemo } from "react";

interface TriggersTableProps {
  owner: { sId: string };
  triggers: WorkspaceTriggerType[];
  onDeleteTrigger?: (trigger: WorkspaceTriggerType) => void;
}

type RowData = {
  sId: string;
  name: string;
  agentName: string;
  agentPictureUrl: string | undefined;
  kind: string;
  status: string;
  isEditor: boolean;
  editorName: string | undefined;
  createdAt: number;
  onClick: () => void;
  menuItems: MenuItem[];
};

function getKindBadge(kind: string) {
  switch (kind) {
    case "schedule":
      return (
        <Chip size="xs" color="info" icon={ClockIcon}>
          Schedule
        </Chip>
      );
    case "webhook":
      return (
        <Chip size="xs" color="success" icon={CloudArrowDownIcon}>
          Webhook
        </Chip>
      );
    default:
      return <Chip size="xs">{kind}</Chip>;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "enabled":
      return (
        <Chip size="xs" color="success">
          Enabled
        </Chip>
      );
    case "disabled":
      return (
        <Chip size="xs" color="primary">
          Disabled
        </Chip>
      );
    case "downgraded":
      return (
        <Chip size="xs" color="warning">
          Downgraded
        </Chip>
      );
    default:
      return <Chip size="xs">{status}</Chip>;
  }
}

const getTableColumns = () => {
  return [
    {
      header: "Agent",
      accessorKey: "agentName",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className="flex flex-row items-center gap-2">
            <Avatar
              visual={info.row.original.agentPictureUrl}
              size="sm"
              icon={BoltIcon}
            />
            <span className="truncate">{info.getValue()}</span>
          </div>
        </DataTable.CellContent>
      ),
      meta: { className: "w-36 @lg:w-48" },
    },
    {
      header: "Trigger Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <span className="truncate font-medium">{info.getValue()}</span>
        </DataTable.CellContent>
      ),
      meta: { className: "w-40 @lg:w-full" },
    },
    {
      header: "Kind",
      accessorKey: "kind",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          {getKindBadge(info.getValue())}
        </DataTable.CellContent>
      ),
      meta: { className: "hidden @sm:w-28 @sm:table-cell" },
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          {getStatusBadge(info.getValue())}
        </DataTable.CellContent>
      ),
      meta: { className: "hidden @sm:w-28 @sm:table-cell" },
    },
    {
      header: "Editor",
      accessorKey: "editorName",
      cell: (info: CellContext<RowData, string | undefined>) => (
        <DataTable.BasicCellContent label={info.getValue() ?? ""} />
      ),
      meta: { className: "hidden @md:w-32 @md:table-cell" },
    },
    {
      header: "Created",
      accessorKey: "createdAt",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          label={formatTimestampToFriendlyDate(info.getValue(), "compact")}
        />
      ),
      meta: { className: "hidden @sm:w-28 @sm:table-cell" },
    },
    {
      header: "",
      accessorKey: "actions",
      cell: (info: CellContext<RowData, unknown>) => (
        <DataTable.MoreButton menuItems={info.row.original.menuItems} />
      ),
      meta: { className: "w-14" },
    },
  ];
};

export function TriggersTable({
  owner,
  triggers,
  onDeleteTrigger,
}: TriggersTableProps) {
  const router = useAppRouter();
  const { pagination, setPagination } = usePaginationFromUrl({});

  const rows: RowData[] = useMemo(() => {
    return triggers.map((trigger) => {
      const menuItems: MenuItem[] = [];

      menuItems.push({
        label: "View details",
        icon: EyeIcon,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          void router.push(getTriggerDetailRoute(owner.sId, trigger.sId));
        },
        kind: "item" as const,
      });

      if (trigger.isEditor) {
        menuItems.push({
          label: "Edit",
          icon: PencilSquareIcon,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            void router.push(getTriggerDetailRoute(owner.sId, trigger.sId));
          },
          kind: "item" as const,
        });
      }

      if (trigger.isEditor && onDeleteTrigger) {
        menuItems.push({
          label: "Delete",
          icon: TrashIcon,
          variant: "warning" as const,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onDeleteTrigger(trigger);
          },
          kind: "item" as const,
        });
      }

      return {
        sId: trigger.sId,
        name: trigger.name,
        agentName: trigger.agentName ?? "Unknown agent",
        agentPictureUrl: trigger.agentPictureUrl,
        kind: trigger.kind,
        status: trigger.status,
        isEditor: trigger.isEditor,
        editorName: trigger.editorName,
        createdAt: trigger.createdAt,
        onClick: () => {
          void router.push(getTriggerDetailRoute(owner.sId, trigger.sId));
        },
        menuItems,
      };
    });
  }, [triggers, owner.sId, router, onDeleteTrigger]);

  return (
    <DataTable
      className="relative"
      data={rows}
      columns={getTableColumns()}
      pagination={pagination}
      setPagination={setPagination}
    />
  );
}
