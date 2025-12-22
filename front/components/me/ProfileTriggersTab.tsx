import {
  Avatar,
  BellIcon,
  Button,
  Chip,
  ClockIcon,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PencilSquareIcon,
  SearchInput,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import cronstrue from "cronstrue";
import { useCallback, useMemo, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useDeleteTrigger, useUserTriggers } from "@app/lib/swr/agent_triggers";
import { classNames } from "@app/lib/utils";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";
import { isGlobalAgentId } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

interface ProfileTriggersTabProps {
  owner: WorkspaceType;
}

export function ProfileTriggersTab({ owner }: ProfileTriggersTabProps) {
  const { triggers, isTriggersLoading } = useUserTriggers({
    workspaceId: owner.sId,
  });

  const [searchQuery, setSearchQuery] = useState("");

  const getEditionURL = useCallback(
    (agentConfigurationId: string) => {
      return getAgentBuilderRoute(owner.sId, agentConfigurationId);
    },
    [owner.sId]
  );

  const [triggerToDelete, setTriggerToDelete] = useState<TriggerType | null>(
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

  const filteredTriggers = useMemo(() => {
    return triggers.filter(
      (trigger) =>
        trigger.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        trigger.agentName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [triggers, searchQuery]);

  const triggerColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "agentName",
        header: "Agent",
        sortingFn: (rowA, rowB) => {
          return rowA.original.agentName.localeCompare(rowB.original.agentName);
        },
        cell: ({ row }) => (
          <DataTable.CellContent>
            <div className="flex items-center gap-2">
              <Avatar size="xs" visual={row.original.agentPictureUrl} />
              <div className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
                {row.original.agentName}
              </div>
              {!row.original.enabled && (
                <Chip size="xs" color="primary">
                  Disabled
                </Chip>
              )}
            </div>
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-48",
        },
      },
      {
        accessorKey: "name",
        header: "Triggers",
        sortingFn: (rowA, rowB) => {
          return rowA.original.name.localeCompare(rowB.original.name);
        },
        cell: ({ row }) => (
          <DataTable.CellContent grow>
            <div
              className={classNames(
                "flex flex-row items-center gap-1 py-3",
                "text-muted-foreground dark:text-muted-foreground-night"
              )}
            >
              <Avatar
                size="xs"
                visual={
                  row.original.kind === "schedule" ? (
                    <ClockIcon />
                  ) : (
                    <BellIcon />
                  )
                }
              />
              <div className="text-sm font-semibold">{row.original.name}</div>
              {row.original.kind === "schedule" && (
                <div className="truncate text-sm">
                  {cronstrue.toString(row.original.configuration.cron)}
                </div>
              )}
            </div>
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-full",
        },
      },
      {
        header: "Action",
        accessorKey: "actions",
        cell: ({ row }) => {
          const buttonProps = isGlobalAgentId(row.original.agentConfigurationId)
            ? {
                onClick: () => setTriggerToDelete(row.original),
                icon: TrashIcon,
                label: "Delete",
              }
            : {
                href: getEditionURL(row.original.agentConfigurationId),
                icon: PencilSquareIcon,
                label: "Manage",
              };

          return (
            <DataTable.CellContent>
              <Button variant="outline" size="sm" {...buttonProps} />
            </DataTable.CellContent>
          );
        },
        meta: {
          className: "w-32",
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
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : filteredTriggers.length > 0 ? (
        <DataTable
          data={filteredTriggers}
          columns={triggerColumns}
          sorting={[{ id: "agentName", desc: false }]}
        />
      ) : triggers.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          You haven't created any triggers yet.
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground">
          No triggers match your search criteria.
        </div>
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
