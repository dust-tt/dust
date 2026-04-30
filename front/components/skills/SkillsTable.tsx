import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { UsedByButton } from "@app/components/spaces/UsedByButton";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import { useAppRouter } from "@app/lib/platform";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type {
  SkillWithRelationsType,
  SkillWithoutInstructionsAndToolsType,
} from "@app/types/assistant/skill_configuration";
import type { AgentsUsageType } from "@app/types/data_source";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Button,
  ClipboardIcon,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EyeIcon,
  PencilSquareIcon,
  PuzzleIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import { useMemo, useState } from "react";

type RowData = {
  name: string;
  icon: string | null;
  description: string;
  editors: UserType[] | null;
  usage: AgentsUsageType;
  usedBySkills: SkillWithoutInstructionsAndToolsType[];
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
          isRounded: true,
        }))
      : // Only Dust-managed skills should have no editors
        [
          {
            name: "Dust",
            visual: DUST_AVATAR_URL,
            isRounded: false,
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
  accessorFn: (row: RowData) => row.usage?.count ?? 0,
  cell: (info: CellContext<RowData, number>) => (
    <DataTable.CellContent>
      <UsedByButton
        usage={info.row.original.usage}
        onItemClick={onAgentClick}
      />
    </DataTable.CellContent>
  ),
  meta: {
    className: "hidden @sm:w-24 @sm:table-cell",
  },
});

function UsedBySkillsButton({
  skills,
  onSkillClick,
}: {
  skills: SkillWithoutInstructionsAndToolsType[];
  onSkillClick: (skillId: string) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  if (skills.length === 0) {
    return (
      <Button
        icon={PuzzleIcon}
        variant="ghost-secondary"
        isSelect={false}
        size="xs"
        label="0"
        disabled
      />
    );
  }

  const query = searchText.toLowerCase();
  const filteredSkills =
    query.length === 0
      ? skills
      : skills.filter((skill) => skill.name.toLowerCase().includes(query));

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          icon={PuzzleIcon}
          variant="ghost-secondary"
          isSelect
          size="xs"
          label={`${skills.length}`}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="h-96 w-72"
        align="end"
        onClick={(e) => e.stopPropagation()}
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus
              name="search-used-by-skills"
              placeholder="Search skills"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredSkills.length > 0) {
                  onSkillClick(filteredSkills[0].sId);
                  setSearchText("");
                  setIsOpen(false);
                }
              }}
            />
            <DropdownMenuSeparator />
          </>
        }
      >
        {filteredSkills.length > 0 ? (
          filteredSkills.map((skill) => {
            const SkillAvatar = getSkillAvatarIcon(skill.icon);
            return (
              <DropdownMenuItem
                key={`skill-picker-${skill.sId}`}
                icon={SkillAvatar}
                label={skill.name}
                truncateText
                className="py-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onSkillClick(skill.sId);
                  setIsOpen(false);
                }}
              />
            );
          })
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            No skills found
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const usedBySkillsColumn = (onSkillClick: (skillId: string) => void) => ({
  header: "Used by skills",
  accessorFn: (row: RowData) => row.usedBySkills.length,
  cell: (info: CellContext<RowData, number>) => (
    <DataTable.CellContent>
      <UsedBySkillsButton
        skills={info.row.original.usedBySkills}
        onSkillClick={onSkillClick}
      />
    </DataTable.CellContent>
  ),
  meta: {
    className: "hidden @lg:w-28 @lg:table-cell",
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

const getTableColumns = ({
  onAgentClick,
  onUsedBySkillClick,
}: {
  onAgentClick: (agentId: string) => void;
  onUsedBySkillClick: (skillId: string) => void;
}) => {
  /**
   * Columns order:
   * - Name (always)
   * - Editors (hidden on mobile)
   * - Used by (hidden on mobile)
   * - Last Edited (hidden on mobile)
   * - Actions (always)
   */

  return [
    nameColumn,
    usedByColumn(onAgentClick),
    usedBySkillsColumn(onUsedBySkillClick),
    editorsColumn,
    lastEditedColumn,
    menuColumn,
  ];
};

type SkillsTableProps = {
  skills: SkillWithRelationsType[];
  owner: LightWorkspaceType;
  onSkillClick: (skill: SkillWithRelationsType) => void;
  onSkillIdClick: (skillId: string) => void;
  onAgentClick: (agentId: string) => void;
};

export function SkillsTable({
  skills,
  owner,
  onSkillClick,
  onSkillIdClick,
  onAgentClick,
}: SkillsTableProps) {
  const router = useAppRouter();
  const { pagination, setPagination } = usePaginationFromUrl({});
  const [skillToArchive, setSkillToArchive] =
    useState<SkillWithRelationsType | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const rows: RowData[] = useMemo(
    () =>
      skills.map((skill) => ({
        name: skill.name,
        icon: skill.icon,
        description: skill.userFacingDescription,
        editors: skill.relations.editors,
        usage: skill.relations.usage,
        usedBySkills: skill.relations.referencedBy,
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
                      getSkillBuilderRoute(owner.sId, skill.sId),
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
                  label: "Customize (New)",
                  icon: ClipboardIcon,
                  disabled: !skill.isExtendable,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    void router.push(
                      getSkillBuilderRoute(
                        owner.sId,
                        "new",
                        `extends=${skill.sId}`,
                      ),
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
    [skills, onSkillClick, owner.sId],
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
          skill={skillToArchive}
          onClose={() => {
            setSkillToArchive(null);
          }}
        />
      )}
      <DataTable
        className="relative"
        data={rows}
        columns={getTableColumns({
          onAgentClick,
          onUsedBySkillClick: onSkillIdClick,
        })}
        pagination={pagination}
        setPagination={setPagination}
      />
    </>
  );
}
