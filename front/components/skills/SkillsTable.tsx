import { DataTable } from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useMemo } from "react";

import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { UserType } from "@app/types";
import type { SkillConfigurationWithAuthorType } from "@app/types/skill_configuration";

type RowData = {
  id: number;
  name: string;
  description: string;
  author: SkillConfigurationWithAuthorType["author"];
  updatedAt: Date;
  onClick?: () => void;
};

const getTableColumns = () => {
  /**
   * Columns order:
   * - Name (always)
   * - Author (hidden on mobile)
   * - Last Edited (hidden on mobile)
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
  ];
};

type SkillsTableProps = {
  skillsConfigurations: SkillConfigurationWithAuthorType[];
};

export function SkillsTable({ skillsConfigurations }: SkillsTableProps) {
  const { pagination, setPagination } = usePaginationFromUrl({});

  const rows: RowData[] = useMemo(
    () =>
      skillsConfigurations.map((skillConfiguration) => {
        return {
          ...skillConfiguration,
          onClick: () => {},
        };
      }),
    [skillsConfigurations]
  );

  if (rows.length === 0) {
    return null;
  }

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
