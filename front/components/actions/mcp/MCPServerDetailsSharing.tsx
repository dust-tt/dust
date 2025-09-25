import {
  DataTable,
  Page,
  ScrollArea,
  SearchInput,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";

type RowData = {
  name: string;
  space: SpaceType;
  serverView: MCPServerViewType | undefined;
  onClick: () => void;
};

export type SharingChange = {
  spaceId: string;
  action: "add" | "remove";
};

const ActionCell = ({
  isEnabled,
  onToggle,
}: {
  isEnabled: boolean;
  onToggle: () => void;
}) => {
  return (
    <DataTable.CellContent>
      <SliderToggle selected={isEnabled} onClick={onToggle} />
    </DataTable.CellContent>
  );
};

interface MCPServerDetailsSharingProps {
  mcpServer?: MCPServerType;
  owner: LightWorkspaceType;
  pendingChanges: SharingChange[];
  onPendingChangesUpdate: (changes: SharingChange[]) => void;
}

export function MCPServerDetailsSharing({
  mcpServer,
  owner,
  pendingChanges,
  onPendingChangesUpdate,
}: MCPServerDetailsSharingProps) {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: false,
  });
  const { mcpServers } = useMCPServers({
    owner,
  });
  const mcpServerWithViews = mcpServers.find((s) => s.sId === mcpServer?.sId);
  const [localSpaceStates, setLocalSpaceStates] = useState<
    Map<string, boolean>
  >(new Map());

  const views = useMemo(
    () =>
      mcpServerWithViews?.views.map((v: MCPServerViewType) => ({
        ...v,
        space: spaces.find((space) => space.sId === v.spaceId),
      })) ?? [],
    [mcpServerWithViews?.views, spaces]
  );

  const globalView = views.find((view) => view.space?.kind === "global");
  const globalSpace = spaces.find((space) => space.kind === "global");

  // Initialize local state when views change.
  useEffect(() => {
    const newStates = new Map<string, boolean>();
    // Set global state.
    if (globalSpace) {
      newStates.set(globalSpace.sId, !!globalView);
    }
    // Set regular space states.
    spaces
      .filter((s) => s.kind === "regular")
      .forEach((space) => {
        const hasView = views.some((view) => view.spaceId === space.sId);
        newStates.set(space.sId, hasView);
      });
    setLocalSpaceStates(newStates);
  }, [views, spaces, globalView, globalSpace]);

  // Determine if currently restricted based on local state.
  const isRestricted = globalSpace
    ? !localSpaceStates.get(globalSpace.sId)
    : true;

  const availableSpaces = (spaces ?? []).filter((s) => s.kind === "regular");

  const handleToggle = (space: SpaceType) => {
    const currentState = localSpaceStates.get(space.sId) ?? false;
    const newState = !currentState;

    // Update local state.
    setLocalSpaceStates((prev) => {
      const updated = new Map(prev);
      updated.set(space.sId, newState);
      return updated;
    });

    // Update pending changes.
    const existingChangeIndex = pendingChanges.findIndex(
      (c) => c.spaceId === space.sId
    );

    const newChanges = [...pendingChanges];

    if (existingChangeIndex >= 0) {
      // Remove existing change if toggling back to original state.
      const originalHasView = views.some((view) => view.spaceId === space.sId);
      if (newState === originalHasView) {
        newChanges.splice(existingChangeIndex, 1);
      } else {
        // Update existing change.
        newChanges[existingChangeIndex] = {
          spaceId: space.sId,
          action: newState ? "add" : "remove",
        };
      }
    } else {
      // Add new change if different from original.
      const originalHasView = views.some((view) => view.spaceId === space.sId);
      if (newState !== originalHasView) {
        newChanges.push({
          spaceId: space.sId,
          action: newState ? "add" : "remove",
        });
      }
    }

    onPendingChangesUpdate(newChanges);
  };

  const rows: RowData[] = availableSpaces
    .map((space) => ({
      name: space.name,
      space: space,
      serverView: views.find((view) => view.spaceId === space.sId),
      onClick: () => handleToggle(space),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const columns: ColumnDef<RowData, any>[] = [
    {
      id: "name",
      header: "Name",
      accessorKey: "name",
    },
    {
      id: "action",
      header: "",
      accessorKey: "viewId",
      meta: {
        className: "w-14",
      },
      cell: (info: CellContext<RowData, string>) => (
        <ActionCell
          isEnabled={localSpaceStates.get(info.row.original.space.sId) ?? false}
          onToggle={info.row.original.onClick}
        />
      ),
    },
  ];

  const [filter, setFilter] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex w-full flex-col gap-y-2 pt-2">
        <div className="flex w-full items-center justify-between overflow-visible">
          <Page.SectionHeader title="Available to all Spaces" />
          <SliderToggle
            selected={!isRestricted}
            onClick={() => {
              if (globalSpace) {
                handleToggle(globalSpace);
              }
            }}
          />
        </div>

        <div className="text-foreground dark:text-foreground-night">
          {isRestricted ? (
            <>
              These tools are only available to the users of the selected
              spaces:
            </>
          ) : (
            <>These tools are accessible to everyone in the workspace.</>
          )}
        </div>
      </div>

      {isRestricted && (
        <>
          <div className="flex flex-row gap-2">
            <SearchInput
              name="filter"
              placeholder="Search a space"
              className="w-full"
              value={filter}
              onChange={(e) => setFilter(e)}
            />
          </div>

          <ScrollArea className="h-full">
            <DataTable
              data={rows}
              columns={columns}
              filter={filter}
              filterColumn="name"
            />
          </ScrollArea>
        </>
      )}
    </div>
  );
}
