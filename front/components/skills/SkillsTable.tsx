import type { MenuItem } from "@dust-tt/sparkle";
import {
  ClipboardIcon,
  DataTable,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { UsedByButton } from "@app/components/spaces/UsedByButton";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType, UserType } from "@app/types";
import { assertNever } from "@app/types";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import type { AgentsUsageType } from "@app/types/data_source";

type RowData = {
  name: string;
  icon: string | null;
  description: string;
  editors: UserType[] | null;
  usage: AgentsUsageType;
  updatedAt: number | null;
  createdAt: number | null;
  onClick: () => void;
  menuItems: MenuItem[];
};

const nameColumn = {
  header: "Name",
  accessorKey: "name",
  cell: (info: CellContext<RowData, string>) => {
    const SkillAvatar = getSkillAvatarIcon(info.row.original.icon);

    return (
      <DataTable.CellContent>
        <div className="flex flex-row items-center gap-2 py-3">
          <div>
            <SkillAvatar />
          </div>
          <div className="flex min-w-0 grow flex-col">
            <div className="heading-sm overflow-hidden truncate text-foreground dark:text-foreground-night">
              {info.getValue()}
            </div>
            <div className="overflow-hidden truncate text-sm text-muted-foreground dark:text-muted-foreground-night">
              {info.row.original.description}
            </div>
          </div>
        </div>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-40 @lg:w-full",
  },
};

const editorsColumn = {
  header: "Editors",
  accessorKey: "editors",
  cell: (info: CellContext<RowData, UserType[]>) => {
    const editors = info.getValue();
    const items = editors
      ? editors.map((editor) => ({
          name: editor.fullName,
          visual: editor.image,
        }))
      : // Only dust managed skills should have no editors
        [
          {
            name: "Dust",
            visual: DUST_AVATAR_URL,
          },
        ];
    return <DataTable.CellContent avatarStack={{ items, nbVisibleItems: 4 }} />;
  },
  meta: {
    className: "hidden @sm:w-32 @sm:table-cell",
  },
};

const usedByColumn = (onAgentClick: (agentId: string) => void) => ({
  header: "Used by",
  accessorKey: "usage",
  cell: (info: CellContext<RowData, AgentsUsageType>) => (
    <DataTable.CellContent>
      <UsedByButton usage={info.getValue()} onItemClick={onAgentClick} />
    </DataTable.CellContent>
  ),
  meta: {
    className: "hidden @sm:w-24 @sm:table-cell",
  },
});

const lastEditedColumn = {
  header: "Last Edited",
  accessorKey: "updatedAt",
  cell: (info: CellContext<RowData, number | null>) => {
    const value = info.getValue();
    return (
      <DataTable.BasicCellContent
        tooltip={value ? formatTimestampToFriendlyDate(value, "long") : ""}
        label={value ? formatTimestampToFriendlyDate(value, "compact") : ""}
      />
    );
  },
  meta: { className: "hidden @sm:w-32 @sm:table-cell" },
};

const suggestionDateColumn = {
  header: "Suggestion date",
  accessorKey: "createdAt",
  cell: (info: CellContext<RowData, number | null>) => {
    const value = info.getValue();
    return (
      <DataTable.BasicCellContent
        tooltip={value ? formatTimestampToFriendlyDate(value, "long") : ""}
        label={value ? formatTimestampToFriendlyDate(value, "compact") : ""}
      />
    );
  },
  meta: { className: "hidden @sm:w-32 @sm:table-cell" },
};

const menuColumn = {
  header: "",
  accessorKey: "menuItems",
  cell: (info: CellContext<RowData, MenuItem[]>) => {
    return <DataTable.MoreButton menuItems={info.getValue()} />;
  },
  meta: {
    className: "w-14",
  },
};

const getTableColumns = (
  onAgentClick: (agentId: string) => void,
  variant: "default" | "suggested"
) => {
  /**
   * Columns order:
   * - Name (always)
   * - Editors (hidden on mobile, not shown for suggested)
   * - Used by (hidden on mobile, not shown for suggested)
   * - Last Edited / Suggestion date (hidden on mobile)
   * - Actions (always)
   */
  switch (variant) {
    case "default":
      return [
        nameColumn,
        editorsColumn,
        usedByColumn(onAgentClick),
        lastEditedColumn,
        menuColumn,
      ];
    case "suggested":
      return [nameColumn, suggestionDateColumn, menuColumn];
    default:
      assertNever(variant);
  }
};

type SkillsTableProps = {
  skills: SkillWithRelationsType[];
  owner: LightWorkspaceType;
  onSkillClick: (skill: SkillWithRelationsType) => void;
  onAgentClick: (agentId: string) => void;
  variant?: "default" | "suggested";
};

export function SkillsTable({
  skills,
  owner,
  onSkillClick,
  onAgentClick,
  variant = "default",
}: SkillsTableProps) {
  const router = useRouter();
  const { pagination, setPagination } = usePaginationFromUrl({});
  const [skillToArchive, setSkillToArchive] =
    useState<SkillWithRelationsType | null>(null);

  const rows: RowData[] = useMemo(
    () =>
      skills.map((skill) => ({
        name: skill.name,
        icon: skill.icon,
        description: skill.userFacingDescription,
        editors: skill.relations.editors,
        usage: skill.relations.usage,
        updatedAt: skill.updatedAt,
        createdAt: skill.createdAt,
        onClick: () => {
          onSkillClick(skill);
        },
        menuItems:
          skill.status !== "archived"
            ? [
                {
                  label: "Edit",
                  icon: PencilSquareIcon,
                  disabled: !skill.canWrite,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    void router.push(
                      getSkillBuilderRoute(owner.sId, skill.sId)
                    );
                  },
                  kind: "item" as const,
                },
                {
                  label: "More info",
                  icon: EyeIcon,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onSkillClick(skill);
                  },
                  kind: "item" as const,
                },
                {
                  label: "Extend (New)",
                  icon: ClipboardIcon,
                  disabled: !skill.isExtendable,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    void router.push(
                      getSkillBuilderRoute(
                        owner.sId,
                        "new",
                        `extends=${skill.sId}`
                      )
                    );
                  },
                  kind: "item" as const,
                },
                {
                  label: "Archive",
                  icon: TrashIcon,
                  disabled: !skill.canWrite,
                  variant: "warning" as const,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    setSkillToArchive(skill);
                  },
                  kind: "item" as const,
                },
              ].filter((item) => !item.disabled)
            : [],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is not stable, mutating the skills list which prevent pagination to work
    [skills, onSkillClick, owner.sId]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      {skillToArchive && (
        <ArchiveSkillDialog
          owner={owner}
          isOpen={true}
          skillConfiguration={skillToArchive}
          onClose={() => {
            setSkillToArchive(null);
          }}
        />
      )}
      <DataTable
        className="relative"
        data={rows}
        columns={getTableColumns(onAgentClick, variant)}
        pagination={pagination}
        setPagination={setPagination}
      />
    </>
  );
}
