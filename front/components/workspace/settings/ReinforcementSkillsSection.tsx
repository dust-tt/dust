import { getSkillAvatarIcon } from "@app/lib/skill";
import {
  useSkillsWithRelations,
  useUpdateSkillReinforcement,
} from "@app/lib/swr/skill_configurations";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type {
  SkillReinforcementMode,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { DataTable, Page, SliderToggle, Spinner } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

interface ReinforcementSkillsSectionProps {
  owner: LightWorkspaceType;
}

type RowData = {
  sId: string;
  name: string;
  icon: string | null;
  editors: UserType[] | null;
  enabled: boolean;
  pendingEnabled: boolean | null;
  isUpdating: boolean;
  currentSpentDollars: number;
  onToggle: () => void;
  onClick?: () => void;
};

function isReinforcementEnabled(
  reinforcement: SkillReinforcementMode
): boolean {
  // "auto" (the default) and "on" both render as enabled. Only "off" disables.
  return reinforcement !== "off";
}

const COLUMNS: ColumnDef<RowData, unknown>[] = [
  {
    header: "Name",
    accessorKey: "name",
    cell: (info: CellContext<RowData, unknown>) => {
      const SkillAvatar = getSkillAvatarIcon(info.row.original.icon);
      return (
        <DataTable.CellContent>
          <div className="flex flex-row items-center gap-2 py-3">
            <SkillAvatar />
            <div className="heading-sm overflow-hidden truncate text-foreground dark:text-foreground-night">
              {info.row.original.name}
            </div>
          </div>
        </DataTable.CellContent>
      );
    },
    meta: { className: "w-40 @lg:w-full" },
  },
  {
    header: "Editors",
    accessorKey: "editors",
    cell: (info: CellContext<RowData, unknown>) => {
      const editors = info.row.original.editors;
      const items = editors
        ? editors.map((editor) => ({
            name: editor.fullName,
            visual: editor.image,
            isRounded: true,
          }))
        : [{ name: "Dust", visual: DUST_AVATAR_URL, isRounded: false }];
      return (
        <DataTable.CellContent avatarStack={{ items, nbVisibleItems: 4 }} />
      );
    },
    meta: { className: "w-32" },
  },
  {
    header: "Enabled",
    accessorKey: "enabled",
    cell: (info: CellContext<RowData, unknown>) => {
      const { enabled, pendingEnabled, isUpdating, onToggle } =
        info.row.original;
      const selected = pendingEnabled ?? enabled;
      return (
        <DataTable.CellContent>
          <SliderToggle
            size="xs"
            selected={selected}
            disabled={isUpdating}
            onClick={onToggle}
          />
        </DataTable.CellContent>
      );
    },
    meta: { className: "w-24" },
  },
  {
    header: "Currently Spent ($)",
    accessorKey: "currentSpentDollars",
    cell: (info: CellContext<RowData, unknown>) => (
      <DataTable.BasicCellContent
        label={formatDollars(info.row.original.currentSpentDollars)}
      />
    ),
    meta: { className: "w-32" },
  },
];

function formatDollars(value: number): string {
  if (value === 0) {
    return "0";
  }
  // Show up to 2 decimals, trimming trailing zeros.
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function microUsdToDollars(microUsd: number): number {
  return microUsd / 1_000_000;
}

export function ReinforcementSkillsSection({
  owner,
}: ReinforcementSkillsSectionProps) {
  const { skillsWithRelations, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({ owner, status: "active", onlyCustom: true });
  const { updateReinforcement } = useUpdateSkillReinforcement({
    owner,
    onlyCustom: true,
  });

  // Per-skill optimistic state while a toggle is in flight.
  const [pendingBySkillId, setPendingBySkillId] = useState<
    Record<string, boolean>
  >({});
  const [updatingBySkillId, setUpdatingBySkillId] = useState<
    Record<string, boolean>
  >({});

  const sortedSkills = useMemo(
    () => [...skillsWithRelations].sort((a, b) => a.name.localeCompare(b.name)),
    [skillsWithRelations]
  );

  const rows: RowData[] = useMemo(
    () =>
      sortedSkills.map((skill: SkillWithRelationsType) => {
        const enabled = isReinforcementEnabled(skill.reinforcement);
        const pending = pendingBySkillId[skill.sId];
        const isUpdating = updatingBySkillId[skill.sId] ?? false;

        const onToggle = async () => {
          const nextEnabled = !(pending ?? enabled);
          const nextMode: SkillReinforcementMode = nextEnabled ? "on" : "off";
          setPendingBySkillId((prev) => ({
            ...prev,
            [skill.sId]: nextEnabled,
          }));
          setUpdatingBySkillId((prev) => ({ ...prev, [skill.sId]: true }));
          const ok = await updateReinforcement(skill.sId, nextMode);
          setUpdatingBySkillId((prev) => {
            const next = { ...prev };
            delete next[skill.sId];
            return next;
          });
          if (!ok) {
            setPendingBySkillId((prev) => {
              const next = { ...prev };
              delete next[skill.sId];
              return next;
            });
          }
        };

        return {
          sId: skill.sId,
          name: skill.name,
          icon: skill.icon,
          editors: skill.relations.editors,
          enabled,
          pendingEnabled: pending ?? null,
          isUpdating,
          currentSpentDollars: microUsdToDollars(
            skill.relations.currentSpentMicroUsd
          ),
          onToggle: () => {
            void onToggle();
          },
        };
      }),
    [sortedSkills, pendingBySkillId, updatingBySkillId, updateReinforcement]
  );

  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.SectionHeader title="Skills" />
      {isSkillsWithRelationsLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No active skills.
        </div>
      ) : (
        <DataTable data={rows} columns={COLUMNS} />
      )}
    </Page.Vertical>
  );
}
