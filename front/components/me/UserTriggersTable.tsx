import { TriggerStatusChip } from "@app/components/triggers/TriggerStatusChip";
import { useSendNotification } from "@app/hooks/useNotification";
import { useDeleteTrigger, useUserTriggers } from "@app/lib/swr/agent_triggers";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import { getTriggerDescription } from "@app/lib/utils/trigger_description";
import type { GetUserTriggersResponseBody } from "@app/types/api/assistant/configuration/triggers";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingBlock,
  SearchInput,
  Spinner,
  Trash01,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

// `onClick` satisfies DataTable's row shape, which is otherwise a weak type.
type UserTriggerRow = GetUserTriggersResponseBody["triggers"][number] & {
  onClick?: () => void;
};

interface UserTriggersTableProps {
  owner: LightWorkspaceType;
}

interface UserTriggerSkeletonRow {
  actions: string;
  agentName: string;
  name: string;
  onClick?: () => void;
  status: string;
}

const USER_TRIGGER_SKELETON_ROWS: UserTriggerSkeletonRow[] = Array.from(
  { length: 5 },
  (_, index) => ({
    actions: `action-${index}`,
    agentName: `agent-${index}`,
    name: `trigger-${index}`,
    status: `status-${index}`,
  })
);

const USER_TRIGGER_SKELETON_COLUMNS: ColumnDef<UserTriggerSkeletonRow>[] = [
  {
    accessorKey: "agentName",
    header: "Agent",
    cell: () => (
      <DataTable.CellContent>
        <div className="flex min-w-0 items-center gap-2">
          <LoadingBlock className="h-7 w-7 shrink-0 rounded-md" />
          <LoadingBlock className="h-4 w-20 max-w-full" />
        </div>
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-40",
    },
  },
  {
    accessorKey: "name",
    header: "Trigger",
    cell: ({ row }) => (
      <DataTable.CellContent grow>
        <div className="flex min-w-0 flex-col py-3">
          <div className="flex h-5 items-center">
            <LoadingBlock
              className={`h-4 max-w-full ${["w-28", "w-36", "w-24", "w-40", "w-32"][row.index]}`}
            />
          </div>
          <div className="flex h-5 items-center">
            <LoadingBlock
              className={`h-4 max-w-full ${["w-64", "w-52", "w-72", "w-60", "w-56"][row.index]}`}
            />
          </div>
        </div>
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-full",
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: () => (
      <DataTable.CellContent>
        <LoadingBlock className="h-6 w-20 rounded-[9px]" />
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-36",
    },
  },
  {
    accessorKey: "actions",
    header: "",
    cell: () => (
      <DataTable.CellContent>
        <LoadingBlock className="h-6 w-20 rounded-[9px]" />
      </DataTable.CellContent>
    ),
    meta: {
      className: "w-24",
    },
  },
];

function UserTriggersTableSkeleton() {
  return (
    <div aria-hidden="true">
      <DataTable
        data={USER_TRIGGER_SKELETON_ROWS}
        columns={USER_TRIGGER_SKELETON_COLUMNS}
        sorting={[{ id: "agentName", desc: false }]}
      />
    </div>
  );
}

export function UserTriggersTable({ owner }: UserTriggersTableProps) {
  const { triggers, isTriggersLoading, mutateTriggers } = useUserTriggers({
    workspaceId: owner.sId,
  });

  const [searchQuery, setSearchQuery] = useState("");

  const getEditionURL = useCallback(
    (agentConfigurationId: string) => {
      return getAgentBuilderRoute(owner.sId, agentConfigurationId);
    },
    [owner.sId]
  );

  const [triggerToDelete, setTriggerToDelete] = useState<UserTriggerRow | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const sendNotification = useSendNotification();

  const deleteTrigger = useDeleteTrigger({
    workspaceId: owner.sId,
    agentConfigurationId: triggerToDelete?.agentConfigurationId ?? "",
  });

  const handleDeleteTrigger = async () => {
    if (!triggerToDelete) {
      return;
    }
    setIsDeleting(true);
    const success = await deleteTrigger(triggerToDelete.sId);
    setIsDeleting(false);
    setTriggerToDelete(null);

    if (success) {
      void mutateTriggers();
      sendNotification({
        type: "success",
        title: "Trigger deleted",
        description: `The trigger "${triggerToDelete.name}" has been deleted.`,
      });
    } else {
      sendNotification({
        type: "error",
        title: "Failed to delete trigger",
        description: "An error occurred while deleting the trigger.",
      });
    }
  };

  const filteredTriggers: UserTriggerRow[] = useMemo(() => {
    return triggers.filter(
      (trigger) =>
        trigger.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trigger.agentName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [triggers, searchQuery]);

  const triggerColumns = useMemo<ColumnDef<UserTriggerRow>[]>(
    () => [
      {
        accessorKey: "agentName",
        header: "Agent",
        sortingFn: (rowA, rowB) => {
          return rowA.original.agentName.localeCompare(rowB.original.agentName);
        },
        cell: ({ row }) => (
          <DataTable.CellContent>
            <div className="flex min-w-0 items-center gap-2">
              <Avatar size="xs" visual={row.original.agentPictureUrl} />
              <div className="truncate text-sm text-foreground dark:text-foreground-night">
                {row.original.agentName}
              </div>
            </div>
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-40",
        },
      },
      {
        accessorKey: "name",
        header: "Trigger",
        sortingFn: (rowA, rowB) => {
          return rowA.original.name.localeCompare(rowB.original.name);
        },
        cell: ({ row }) => (
          <DataTable.CellContent grow>
            <div className="flex min-w-0 flex-col py-3">
              <div className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
                {row.original.name}
              </div>
              <div className="truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
                {getTriggerDescription(row.original)}
              </div>
            </div>
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-full",
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <DataTable.CellContent>
            <TriggerStatusChip status={row.original.status} />
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-36",
        },
      },
      {
        header: "",
        accessorKey: "actions",
        cell: ({ row }) => {
          const buttonProps = isGlobalAgentId(row.original.agentConfigurationId)
            ? {
                onClick: () => setTriggerToDelete(row.original),
                icon: Trash01,
                tooltip: "Delete trigger",
              }
            : {
                href: getEditionURL(row.original.agentConfigurationId),
                label: "Manage",
              };

          return (
            <DataTable.CellContent>
              <Button variant="outline" size="xs" {...buttonProps} />
            </DataTable.CellContent>
          );
        },
        meta: {
          className: "w-24",
        },
      },
    ],
    [getEditionURL]
  );

  return (
    <>
      <div className="relative my-4">
        <SearchInput
          name="search"
          placeholder="Search triggers and agents"
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {isTriggersLoading ? (
        <UserTriggersTableSkeleton />
      ) : filteredTriggers.length > 0 ? (
        <DataTable
          data={filteredTriggers}
          columns={triggerColumns}
          sorting={[{ id: "agentName", desc: false }]}
        />
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {searchQuery
            ? "No triggers match your search criteria."
            : "You haven't created any triggers yet."}
        </p>
      )}

      <Dialog
        open={triggerToDelete !== null}
        onOpenChange={(open) => !open && setTriggerToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete trigger</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the trigger "
              {triggerToDelete?.name}"?
            </DialogDescription>
          </DialogHeader>
          {isDeleting ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <>
              <DialogContainer>
                <b>This action cannot be undone.</b>
              </DialogContainer>
              <DialogFooter
                leftButtonProps={{
                  label: "Cancel",
                  variant: "outline",
                }}
                rightButtonProps={{
                  label: "Delete",
                  variant: "warning",
                  onClick: handleDeleteTrigger,
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
