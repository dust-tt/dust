import type { MenuItem } from "@dust-tt/sparkle";
import { DataTable, TrashIcon } from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { UsedByButton } from "@app/components/spaces/UsedByButton";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType, UserType } from "@app/types";
import type {
  SkillConfigurationRelations,
  SkillConfigurationType,
} from "@app/types/assistant/skill_configuration";

type RowData = {
  skillConfigurationWithRelations: SkillConfigurationType &
    SkillConfigurationRelations;
  onClick: () => void;
  menuItems?: MenuItem[];
};

const getTableColumns = (onAgentClick: (agentId: string) => void) => {
  /**
   * Columns order:
   * - Name (always)
   * - Editors (hidden on mobile)
   * - Used by (hidden on mobile)
   * - Last Edited (hidden on mobile)
   * - Actions (always)
   */

  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent>
          <div className="flex min-w-0 grow flex-col py-3">
            <div className="heading-sm overflow-hidden truncate text-foreground dark:text-foreground-night">
              {info.row.original.skillConfigurationWithRelations.name}
            </div>
            <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
              {info.row.original.skillConfigurationWithRelations.description}
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-40 @lg:w-full",
      },
    },
    {
      header: "Editors",
      accessorKey: "editors",
      cell: (info: CellContext<RowData, UserType[]>) => {
        return (
          <DataTable.CellContent
            avatarStack={{
              items:
                info.row.original.skillConfigurationWithRelations.editors.map(
                  (editor) => ({
                    name: editor.fullName,
                    visual: editor.image,
                  })
                ),
              nbVisibleItems: 4,
            }}
          />
        );
      },
      meta: {
        className: "hidden @sm:w-32 @sm:table-cell",
      },
    },
    {
      header: "Used by",
      accessorFn: (row: RowData) =>
        row.skillConfigurationWithRelations.usage.count,
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.CellContent>
          <UsedByButton
            usage={info.row.original.skillConfigurationWithRelations.usage}
            onItemClick={onAgentClick}
          />
        </DataTable.CellContent>
      ),
      meta: {
        className: "hidden @sm:w-24 @sm:table-cell",
      },
    },
    {
      header: "Last Edited",
      accessorKey: "updatedAt",
      cell: (info: CellContext<RowData, number>) => (
        <DataTable.BasicCellContent
          tooltip={formatTimestampToFriendlyDate(info.getValue(), "long")}
          label={
            info.getValue()
              ? formatTimestampToFriendlyDate(info.getValue(), "compact")
              : "-"
          }
        />
      ),
      meta: { className: "hidden @sm:w-32 @sm:table-cell" },
    },
    {
      header: "",
      accessorKey: "actions",
      cell: (info: CellContext<RowData, number>) => {
        return <DataTable.MoreButton menuItems={info.row.original.menuItems} />;
      },
      meta: {
        className: "w-14",
      },
    },
  ];
};

type SkillsTableProps = {
  skillConfigurationsWithRelations: (SkillConfigurationType &
    SkillConfigurationRelations)[];
  owner: LightWorkspaceType;
  setSkillConfigurationWithRelations: (
    skill: SkillConfigurationType & SkillConfigurationRelations
  ) => void;
  onAgentClick: (agentId: string) => void;
};

export function SkillsTable({
  skillConfigurationsWithRelations,
  owner,
  setSkillConfigurationWithRelations,
  onAgentClick,
}: SkillsTableProps) {
  const { pagination, setPagination } = usePaginationFromUrl({});
  const [skillConfigurationToArchive, setSkillConfigurationToArchive] =
    useState<SkillConfigurationType | null>(null);

  const rows: RowData[] = useMemo(
    () =>
      skillConfigurationsWithRelations.map(
        (skillConfigurationWithRelations) => ({
          skillConfigurationWithRelations,
          onClick: () => {
            setSkillConfigurationWithRelations(skillConfigurationWithRelations);
          },
          menuItems: [
            {
              label: "Archive",
              icon: TrashIcon,
              variant: "warning" as const,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                setSkillConfigurationToArchive(skillConfigurationWithRelations);
              },
              kind: "item" as const,
            },
          ],
        })
      ),
    [skillConfigurationsWithRelations, setSkillConfigurationWithRelations]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      {skillConfigurationToArchive && (
        <ArchiveSkillDialog
          owner={owner}
          isOpen={true}
          skillConfiguration={skillConfigurationToArchive}
          onClose={() => {
            setSkillConfigurationToArchive(null);
          }}
        />
      )}
      <DataTable
        className="relative"
        data={rows}
        columns={getTableColumns(onAgentClick)}
        pagination={pagination}
        setPagination={setPagination}
      />
    </>
  );
}
