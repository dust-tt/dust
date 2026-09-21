import {
  Avatar,
  Button,
  Chip,
  DataTable,
  Plus,
  SearchInput,
  ShapesPlus,
  Tooltip,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import {
  countSkillsUsingTool,
  formatBuildDate,
  formatBuildDateLong,
  type MockTool,
  mockTools,
} from "../data/build";
import { getCompanySpaceById } from "../data/companySpaces";
import { getUserById } from "../data/users";
import { ToolDetailsSheet } from "./BuildDetailSheets";
import { UsedByCell } from "./buildTableShared";
import { EmptyState } from "./EmptyState";

// The product's Tools table, the one an admin works through in the system
// Space. It has no checkbox column: a tool's Spaces and its per-operation
// stakes are set one tool at a time, in the sheet, so there is nothing here to
// do to a dozen rows at once.

function availabilityLabel(tool: MockTool): string {
  if (tool.isWorkspaceWide) {
    return "Workspace";
  }
  const names = tool.spaceIds
    .map((spaceId) => getCompanySpaceById(spaceId)?.name)
    .filter((name): name is string => name != null);

  return names.length > 0 ? names.join(", ") : "Not shared";
}

type RowData = MockTool & {
  /** Derived, since the skills hold the tool list rather than the other way. */
  usedBySkillCount: number;
  onClick: () => void;
};

function buildColumns(): ColumnDef<RowData>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: (info: CellContext<RowData, string>) => {
        const tool = info.row.original;
        return (
          <DataTable.CellContent grow>
            <div className="flex flex-row items-center gap-3 py-3">
              <Avatar size="sm" icon={tool.icon} />
              <div className="flex min-w-0 grow flex-col">
                <div className="heading-sm truncate text-foreground">
                  {tool.name}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {tool.description}
                </div>
              </div>
              {!tool.isConnected && (
                <Chip color="warning" size="xs" label="Disconnected" />
              )}
            </div>
          </DataTable.CellContent>
        );
      },
      meta: { className: "w-40 @lg:w-full" },
    },
    {
      id: "usedBy",
      accessorFn: (row: RowData) =>
        row.usedByAgentIds.length + row.usedBySkillCount,
      header: () => <div className="flex w-full justify-center">Used by</div>,
      cell: (info: CellContext<RowData, number>) => {
        const tool = info.row.original;
        return (
          <UsedByCell
            agentCount={tool.usedByAgentIds.length}
            skillCount={tool.usedBySkillCount}
          />
        );
      },
      meta: { className: "hidden px-0 @sm:w-32 @sm:table-cell" },
    },
    {
      id: "availability",
      accessorFn: (row: RowData) => availabilityLabel(row),
      header: "Availability",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <span className="truncate text-sm">{info.getValue()}</span>
        </DataTable.CellContent>
      ),
      meta: { className: "hidden @sm:w-36 @sm:table-cell" },
    },
    {
      id: "account",
      accessorKey: "account",
      header: "Account",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <span className="truncate text-sm">{info.getValue() || "-"}</span>
        </DataTable.CellContent>
      ),
      meta: {
        className: "hidden @lg:w-24 @lg:table-cell",
        tooltip: "Whose credentials the tool runs with.",
      },
    },
    {
      id: "by",
      accessorKey: "editorId",
      header: "By",
      enableSorting: false,
      cell: (info: CellContext<RowData, string>) => {
        const editor = getUserById(info.getValue());
        return (
          <DataTable.CellContent
            avatarUrl={editor?.portrait}
            avatarTooltipLabel={editor?.fullName}
            roundedAvatar
          />
        );
      },
      meta: { className: "hidden @lg:w-16 @lg:table-cell" },
    },
    {
      id: "lastUpdated",
      accessorFn: (row: RowData) => row.updatedAt.getTime(),
      header: "Last updated",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          label={formatBuildDate(info.row.original.updatedAt)}
          tooltip={formatBuildDateLong(info.row.original.updatedAt)}
        />
      ),
      meta: { className: "hidden @sm:w-32 @sm:table-cell" },
    },
  ];
}

export function ManageToolsView() {
  const [search, setSearch] = useState("");
  const [detailedToolId, setDetailedToolId] = useState<string | null>(null);

  const columns = useMemo(() => buildColumns(), []);

  // A tool is as often looked for by what it does as by its name, so the
  // operations answer the search too.
  const rows: RowData[] = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mockTools
      .filter((tool) => {
        if (!query) {
          return true;
        }
        const operationNames = tool.operations
          .map((operation) => operation.name)
          .join(" ");
        return `${tool.name} ${tool.description} ${operationNames}`
          .toLowerCase()
          .includes(query);
      })
      .map((tool) => ({
        ...tool,
        usedBySkillCount: countSkillsUsingTool(tool.id),
        onClick: () => setDetailedToolId(tool.id),
      }));
  }, [search]);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background px-4">
      <div className="@container mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 pt-6 pb-8">
        <div className="flex items-center gap-2">
          <SearchInput
            name="tools-search"
            placeholder="Search tools"
            value={search}
            onChange={setSearch}
            className="w-full min-w-0 max-w-80"
          />
          <Tooltip
            label="Connect a platform, or point Dust at an MCP server"
            trigger={
              <Button
                size="sm"
                variant="highlight"
                icon={Plus}
                label="Add tools"
                className="ml-auto shrink-0"
              />
            }
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={ShapesPlus}
            title="No tools"
            description="No tool matches your search."
          />
        ) : (
          <DataTable data={rows} columns={columns} />
        )}
      </div>

      <ToolDetailsSheet
        toolId={detailedToolId}
        onClose={() => setDetailedToolId(null)}
      />
    </div>
  );
}
