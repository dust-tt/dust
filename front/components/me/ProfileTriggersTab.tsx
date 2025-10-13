import {
  Avatar,
  BellIcon,
  Button,
  ClockIcon,
  DataTable,
  PencilSquareIcon,
  SearchInput,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import cronstrue from "cronstrue";
import { useCallback, useMemo, useState } from "react";

import {
  useRemoveTriggerSubscriber,
  useUserTriggers,
} from "@app/lib/swr/agent_triggers";
import { classNames } from "@app/lib/utils";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

interface ProfileTriggersTabProps {
  owner: WorkspaceType;
}

export function ProfileTriggersTab({ owner }: ProfileTriggersTabProps) {
  const { triggers, isTriggersLoading } = useUserTriggers({
    workspaceId: owner.sId,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const unsubscribe = useRemoveTriggerSubscriber({
    workspaceId: owner.sId,
  });

  const getEditionURL = useCallback(
    (agentConfigurationId: string) => {
      return getAgentBuilderRoute(owner.sId, agentConfigurationId);
    },
    [owner.sId]
  );

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
        cell: ({ row }) => (
          <DataTable.CellContent>
            <div className="flex justify-end">
              {row.original.isEditor ? (
                <Button
                  label="Manage"
                  href={getEditionURL(row.original.agentConfigurationId)}
                  variant="outline"
                  size="sm"
                  icon={PencilSquareIcon}
                />
              ) : (
                <Button
                  label="Unsubscribe"
                  icon={XMarkIcon}
                  variant="outline"
                  size="sm"
                  isLoading={isLoading}
                  disabled={isLoading}
                  onClick={async () => {
                    setIsLoading(true);
                    await unsubscribe(
                      row.original.sId,
                      row.original.agentConfigurationId
                    );
                    setIsLoading(false);
                  }}
                />
              )}
            </div>
          </DataTable.CellContent>
        ),
        meta: {
          className: "w-32",
        },
      },
    ],
    [unsubscribe, getEditionURL, isLoading]
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
          You are not involved with any triggers yet.
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground">
          No triggers match your search criteria.
        </div>
      )}
    </>
  );
}
