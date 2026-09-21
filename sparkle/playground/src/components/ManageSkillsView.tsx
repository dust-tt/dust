import {
  Avatar,
  Button,
  Chip,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Edit04,
  type MenuItem,
  Plus,
  PuzzlePiece01,
  SearchInput,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  Trash01,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import {
  formatBuildDate,
  formatBuildDateLong,
  type ManagedSkill,
  mockManagedSkills,
  SKILL_AVAILABILITIES,
  SKILL_AVAILABILITY_DISPLAY,
  type SkillAvailability,
  withCurrentUserAsEditor,
} from "../data/build";
import { getUserById } from "../data/users";
import { BulkSelectionBar } from "./BulkSelectionBar";
import { SkillDetailsSheet } from "./BuildDetailSheets";
import {
  type BatchConfirmCopy,
  BatchConfirmDialog,
  buildSelectionColumn,
  FilterMenu,
  UsedByCell,
} from "./buildTableShared";
import { EmptyState } from "./EmptyState";

// The product's Skills table. Same shape as the Agents one, with availability
// standing in for access and a shorter batch bar: a skill's availability and
// whether it is archived are the only two things worth changing in bulk.

const TABS = [
  { id: "all", label: "All", tooltip: "All active skills." },
  { id: "editable", label: "Editable by me", tooltip: "Skills you can edit." },
  { id: "archived", label: "Archived", tooltip: "Archived skills." },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Dust maintains its own skills, so they are never anyone's to batch-edit. */
function isSkillSelectable(skill: ManagedSkill): boolean {
  return !skill.isDustProvided && skill.status === "active";
}

type RowData = ManagedSkill & { onClick: () => void; menuItems: MenuItem[] };

// ── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<RowData>[] {
  return [
    buildSelectionColumn<RowData>("skill"),
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className="flex flex-row items-center gap-3 py-3">
            <Avatar
              size="sm"
              icon={info.row.original.icon}
              backgroundColor="bg-highlight-50"
              iconColor="text-highlight-700"
            />
            <div className="flex min-w-0 grow flex-col">
              <div className="heading-sm truncate text-foreground">
                {info.getValue()}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {info.row.original.description}
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: { className: "w-40 @lg:w-full" },
    },
    {
      id: "availability",
      accessorKey: "availability",
      header: "Availability",
      cell: (info: CellContext<RowData, SkillAvailability>) => {
        const display = SKILL_AVAILABILITY_DISPLAY[info.getValue()];
        return (
          <DataTable.CellContent>
            <Tooltip
              label={display.tooltip}
              trigger={
                <Chip size="xs" color={display.color} label={display.label} />
              }
            />
          </DataTable.CellContent>
        );
      },
      meta: { className: "hidden @sm:w-40 @sm:table-cell" },
    },
    {
      id: "usedBy",
      accessorFn: (row: RowData) => row.usedByAgentIds.length,
      header: () => <div className="flex w-full justify-center">Used by</div>,
      cell: (info: CellContext<RowData, number>) => (
        <UsedByCell agentCount={info.getValue()} />
      ),
      meta: { className: "hidden px-0 @sm:w-32 @sm:table-cell" },
    },
    {
      id: "usage",
      accessorFn: (row: RowData) => row.usageCount ?? -1,
      header: "Usage",
      cell: (info: CellContext<RowData, number>) => {
        const { usageCount } = info.row.original;
        return (
          <DataTable.BasicCellContent
            className="font-mono"
            label={usageCount === null ? "-" : usageCount.toLocaleString()}
            tooltip={
              usageCount === null
                ? "Dust skills are always active, so message usage does not apply"
                : `${usageCount.toLocaleString()} messages over the last 30 days`
            }
          />
        );
      },
      meta: {
        className: "hidden @sm:w-20 @sm:table-cell",
        tooltip: "Messages over the last 30 days.",
      },
    },
    {
      id: "editors",
      accessorKey: "editorIds",
      header: "Editors",
      enableSorting: false,
      cell: (info: CellContext<RowData, string[]>) => {
        const editors = info.getValue().flatMap((id) => {
          const user = getUserById(id);
          return user ? [user] : [];
        });

        // A skill with no editors is one Dust maintains, which the table says
        // by naming Dust rather than leaving the cell blank.
        if (editors.length === 0) {
          return <DataTable.BasicCellContent label="Dust" />;
        }

        return (
          <DataTable.CellContent
            avatarStack={{
              items: editors.map((editor) => ({
                name: editor.fullName,
                visual: editor.portrait,
              })),
              nbVisibleItems: 4,
            }}
          />
        );
      },
      meta: { className: "hidden @sm:w-32 @sm:table-cell" },
    },
    {
      id: "lastEdited",
      accessorFn: (row: RowData) => row.updatedAt.getTime(),
      header: "Last Edited",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          label={formatBuildDate(info.row.original.updatedAt)}
          tooltip={formatBuildDateLong(info.row.original.updatedAt)}
        />
      ),
      meta: { className: "hidden @sm:w-32 @sm:table-cell" },
    },
    {
      id: "actions",
      accessorKey: "menuItems",
      header: "",
      enableSorting: false,
      cell: (info: CellContext<RowData, MenuItem[]>) => (
        <DataTable.MoreButton menuItems={info.getValue()} />
      ),
      meta: { className: "w-14" },
    },
  ];
}

// ── Batch bar ────────────────────────────────────────────────────────────────

type PendingBatch =
  | { kind: "availability"; availability: SkillAvailability }
  | { kind: "archive" };

const BATCH_COPY: Record<PendingBatch["kind"], BatchConfirmCopy> = {
  availability: {
    title: "Set availability",
    body: "This changes who can reach for them in the composer and the agent builder.",
    confirmLabel: "Set availability",
  },
  archive: {
    title: "Archive skills",
    body: "They drop off every agent using them, which stops working until it is rebuilt.",
    confirmLabel: "Archive",
    isWarning: true,
  },
};

function SkillBatchBar({
  selectedCount,
  totalSelectableCount,
  onClear,
  onSelectAll,
  onRequestBatch,
}: {
  selectedCount: number;
  totalSelectableCount: number;
  onClear: () => void;
  onSelectAll: () => void;
  onRequestBatch: (batch: PendingBatch) => void;
}) {
  return (
    <BulkSelectionBar
      selectedCount={selectedCount}
      totalCount={totalSelectableCount}
      itemLabel="skill"
      canSelectAll={selectedCount < totalSelectableCount}
      onSelectAll={onSelectAll}
      onClear={onClear}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            isSelect
            label="Set availability"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel label="Set availability" />
          {SKILL_AVAILABILITIES.map((availability) => (
            <DropdownMenuItem
              key={availability}
              label={SKILL_AVAILABILITY_DISPLAY[availability].label}
              description={SKILL_AVAILABILITY_DISPLAY[availability].tooltip}
              onClick={() =>
                onRequestBatch({ kind: "availability", availability })
              }
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="warning"
        icon={Trash01}
        label="Archive"
        onClick={() => onRequestBatch({ kind: "archive" })}
      />
    </BulkSelectionBar>
  );
}

// ── View ─────────────────────────────────────────────────────────────────────

interface ManageSkillsViewProps {
  /** Whose skills count as "editable by me". */
  currentUserId: string;
}

export function ManageSkillsView({ currentUserId }: ManageSkillsViewProps) {
  const [skills, setSkills] = useState<ManagedSkill[]>(() =>
    withCurrentUserAsEditor(
      mockManagedSkills,
      currentUserId,
      (skill) => !skill.isDustProvided
    )
  );
  const [tab, setTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [availabilityFilters, setAvailabilityFilters] = useState<string[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [pendingBatch, setPendingBatch] = useState<PendingBatch | null>(null);
  const [detailedSkillId, setDetailedSkillId] = useState<string | null>(null);

  const skillsByTab = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesFilters = (skill: ManagedSkill) => {
      if (query) {
        const editorNames = skill.editorIds
          .map((id) => getUserById(id)?.fullName ?? "")
          .join(" ");
        if (!`${skill.name} ${editorNames}`.toLowerCase().includes(query)) {
          return false;
        }
      }
      return !(
        availabilityFilters.length > 0 &&
        !availabilityFilters.includes(skill.availability)
      );
    };

    const active = skills.filter(
      (skill) => skill.status === "active" && matchesFilters(skill)
    );

    return {
      all: active,
      editable: active.filter((skill) =>
        skill.editorIds.includes(currentUserId)
      ), // prettier-ignore
      archived: skills.filter(
        (skill) => skill.status === "archived" && matchesFilters(skill)
      ),
    } satisfies Record<TabId, ManagedSkill[]>;
  }, [availabilityFilters, currentUserId, search, skills]);

  const visibleSkills = skillsByTab[tab];

  // A skill that drops out of view drops out of the selection with it.
  const selectionScopeKey = `${tab}|${search}|${availabilityFilters.join()}`;
  useEffect(() => {
    setRowSelection({});
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
  }, [selectionScopeKey]);

  const selectableIds = useMemo(
    () => visibleSkills.filter(isSkillSelectable).map((skill) => skill.id),
    [visibleSkills]
  );

  const selectedIds = useMemo(
    () =>
      visibleSkills.filter((skill) => rowSelection[skill.id]).map((s) => s.id), // prettier-ignore
    [rowSelection, visibleSkills]
  );

  const handleConfirmBatch = () => {
    if (!pendingBatch) {
      return;
    }
    const targets = new Set(selectedIds);
    const patch = (skill: ManagedSkill): ManagedSkill =>
      pendingBatch.kind === "availability"
        ? { ...skill, availability: pendingBatch.availability }
        : { ...skill, status: "archived" };

    setSkills((previous) =>
      previous.map((skill) => (targets.has(skill.id) ? patch(skill) : skill))
    );
    setRowSelection({});
    setPendingBatch(null);
  };

  const columns = useMemo(() => buildColumns(), []);

  const rows: RowData[] = useMemo(
    () =>
      visibleSkills.map((skill) => ({
        ...skill,
        onClick: () => setDetailedSkillId(skill.id),
        menuItems: [
          ...(isSkillSelectable(skill)
            ? [{ kind: "item" as const, label: "Edit", icon: Edit04 }]
            : []),
          {
            kind: "item" as const,
            label: "More info",
            icon: PuzzlePiece01,
            onClick: () => setDetailedSkillId(skill.id),
          },
          ...(isSkillSelectable(skill)
            ? [
                {
                  kind: "item" as const,
                  label: "Archive",
                  icon: Trash01,
                  variant: "warning" as const,
                  onClick: () =>
                    setSkills((previous) =>
                      previous.map((item) =>
                        item.id === skill.id
                          ? { ...item, status: "archived" }
                          : item
                      )
                    ),
                },
              ]
            : []),
        ],
      })),
    [visibleSkills]
  );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background px-4">
      <div className="@container mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 pt-6 pb-8">
        <div className="flex items-center gap-2">
          <SearchInput
            name="skills-search"
            placeholder="Search (Name, Editors)"
            value={search}
            onChange={setSearch}
            className="w-full min-w-0 max-w-80"
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <FilterMenu
              label="Availability"
              options={SKILL_AVAILABILITIES.map((availability) => ({
                value: availability,
                label: SKILL_AVAILABILITY_DISPLAY[availability].label,
              }))}
              selected={availabilityFilters}
              onChange={setAvailabilityFilters}
            />
            <Button
              size="sm"
              variant="highlight"
              icon={Plus}
              label="New skill"
            />
          </div>
        </div>

        {availabilityFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {availabilityFilters.map((availability) => (
              <Chip
                key={availability}
                size="xs"
                label={
                  SKILL_AVAILABILITY_DISPLAY[availability as SkillAvailability]
                    .label
                }
                onRemove={() =>
                  setAvailabilityFilters((previous) =>
                    previous.filter((value) => value !== availability)
                  )
                }
              />
            ))}
          </div>
        )}

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
          <TabsList>
            {TABS.map((tabItem) => (
              <TabsTrigger
                key={tabItem.id}
                value={tabItem.id}
                label={tabItem.label}
                tooltip={tabItem.tooltip}
                isCounter={tabItem.id !== "archived"}
                counterValue={`${skillsByTab[tabItem.id].length}`}
              />
            ))}
          </TabsList>
        </Tabs>

        {rows.length === 0 ? (
          <EmptyState
            icon={PuzzlePiece01}
            title="No skills"
            description={
              search || availabilityFilters.length > 0
                ? "No skill matches your search."
                : "Nothing in this tab yet."
            }
          />
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            pagination={pagination}
            setPagination={setPagination}
            getRowId={(row) => row.id}
            enableRowSelection={(row) => isSkillSelectable(row.original)}
            disableRowClickSelection
            rowSelection={rowSelection}
            setRowSelection={setRowSelection}
          />
        )}

        <SkillBatchBar
          selectedCount={selectedIds.length}
          totalSelectableCount={selectableIds.length}
          onClear={() => setRowSelection({})}
          onSelectAll={() =>
            setRowSelection(
              Object.fromEntries(selectableIds.map((id) => [id, true]))
            )
          }
          onRequestBatch={setPendingBatch}
        />
      </div>

      <BatchConfirmDialog
        copy={pendingBatch ? BATCH_COPY[pendingBatch.kind] : null}
        countLabel={`${selectedIds.length} skill${selectedIds.length === 1 ? "" : "s"}`}
        onCancel={() => setPendingBatch(null)}
        onConfirm={handleConfirmBatch}
      />

      <SkillDetailsSheet
        skillId={detailedSkillId}
        onClose={() => setDetailedSkillId(null)}
      />
    </div>
  );
}
