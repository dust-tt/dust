import type { MenuItem } from "@dust-tt/sparkle";
import { DataTable, TrashIcon } from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType, UserType } from "@app/types";
import type {
  SkillConfigurationType,
  SkillConfigurationWithAuthorType,
} from "@app/types/assistant/skill_configuration";

type RowData = {
  sId: string;
  name: string;
  description: string;
  author: SkillConfigurationWithAuthorType["author"];
  updatedAt: number;
  onClick?: () => void;
  menuItems?: MenuItem[];
};

const getTableColumns = () => {
  /**
   * Columns order:
   * - Name (always)
   * - Author (hidden on mobile)
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
              {info.row.original.name}
            </div>
            <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
              {info.row.original.description}
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        className: "w-40 @lg:w-full",
      },
    },
    {
      header: "Author",
      accessorKey: "author",
      cell: (info: CellContext<RowData, UserType>) => {
        const author = info.getValue();

        return (
          <DataTable.CellContent
            avatarStack={{
              items: [
                {
                  name: author.fullName,
                  visual: author.image,
                },
              ],
            }}
          />
        );
      },
      meta: {
        className: "hidden @sm:w-32 @sm:table-cell",
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
  skillConfigurations: SkillConfigurationWithAuthorType[];
  owner: LightWorkspaceType;
  setSkillConfiguration: (skill: SkillConfigurationWithAuthorType) => void;
};

export function SkillsTable({
  skillConfigurations,
  owner,
  setSkillConfiguration,
}: SkillsTableProps) {
  const { pagination, setPagination } = usePaginationFromUrl({});
  const [skillConfigurationToArchive, setSkillConfigurationToArchive] =
    useState<SkillConfigurationType | null>(null);

  const rows: RowData[] = useMemo(
    () =>
      skillConfigurations.map((skillConfiguration) => {
        return {
          ...skillConfiguration,
          onClick: () => {
            setSkillConfiguration(skillConfiguration);
          },
          menuItems: [
            {
              label: "Archive",
              icon: TrashIcon,
              variant: "warning" as const,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                setSkillConfigurationToArchive(skillConfiguration);
              },
              kind: "item" as const,
            },
          ],
        };
      }),
    [skillConfigurations, setSkillConfiguration]
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
        columns={getTableColumns()}
        pagination={pagination}
        setPagination={setPagination}
      />
    </>
  );
}
