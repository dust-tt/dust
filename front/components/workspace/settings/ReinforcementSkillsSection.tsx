import { getSkillAvatarIcon } from "@app/lib/skill";
import {
  useSkillsWithRelations,
  useUpdateSkillReinforcement,
} from "@app/lib/swr/skill_configurations";
import { useSkillsReinforcementSpend } from "@app/lib/swr/useReinforcementToggle";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type {
  SkillReinforcementMode,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  DataTable,
  Input,
  Page,
  SearchInput,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

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
  isEnabledUpdating: boolean;
  lock: boolean;
  pendingLock: boolean | null;
  isLockUpdating: boolean;
  currentSpentDollars: number;
  capInputValue: string;
  isCapUpdating: boolean;
  onToggleEnabled: () => void;
  onToggleLock: () => void;
  onCapChange: (value: string) => void;
  onCapCommit: () => void;
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
      const { enabled, pendingEnabled, isEnabledUpdating, onToggleEnabled } =
        info.row.original;
      const selected = pendingEnabled ?? enabled;
      return (
        <DataTable.CellContent>
          <SliderToggle
            size="xs"
            selected={selected}
            disabled={isEnabledUpdating}
            onClick={onToggleEnabled}
          />
        </DataTable.CellContent>
      );
    },
    meta: { className: "w-24" },
  },
  {
    header: "Lock State",
    accessorKey: "lock",
    cell: (info: CellContext<RowData, unknown>) => {
      const { lock, pendingLock, isLockUpdating, onToggleLock } =
        info.row.original;
      const selected = pendingLock ?? lock;
      return (
        <DataTable.CellContent>
          <SliderToggle
            size="xs"
            selected={selected}
            disabled={isLockUpdating}
            onClick={onToggleLock}
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
  {
    header: "Cap ($)",
    accessorKey: "capInputValue",
    cell: (info: CellContext<RowData, unknown>) => {
      const { sId, capInputValue, isCapUpdating, onCapChange, onCapCommit } =
        info.row.original;
      return (
        <DataTable.CellContent>
          <Input
            name={`cap-${sId}`}
            value={capInputValue}
            disabled={isCapUpdating}
            onChange={(e) => onCapChange(e.target.value)}
            onBlur={onCapCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCapCommit();
              }
            }}
          />
        </DataTable.CellContent>
      );
    },
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

function dollarsToMicroUsd(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}

// Returns a copy of `bySkillId` with the entry for `skillId` removed.
function withoutSkill<T>(
  bySkillId: Record<string, T>,
  skillId: string
): Record<string, T> {
  const { [skillId]: _omit, ...rest } = bySkillId;
  return rest;
}

export function ReinforcementSkillsSection({
  owner,
}: ReinforcementSkillsSectionProps) {
  const { skillsWithRelations, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({ owner, status: "active", onlyCustom: true });
  const { spentMicroUsdBySkillId } = useSkillsReinforcementSpend({ owner });
  const { updateSkillReinforcement } = useUpdateSkillReinforcement({
    owner,
    onlyCustom: true,
  });

  // Per-skill optimistic state during in-flight updates.
  const [pendingEnabledBySkillId, setPendingEnabledBySkillId] = useState<
    Record<string, boolean>
  >({});
  const [enabledUpdatingBySkillId, setEnabledUpdatingBySkillId] = useState<
    Record<string, boolean>
  >({});
  const [pendingLockBySkillId, setPendingLockBySkillId] = useState<
    Record<string, boolean>
  >({});
  const [lockUpdatingBySkillId, setLockUpdatingBySkillId] = useState<
    Record<string, boolean>
  >({});
  const [capInputBySkillId, setCapInputBySkillId] = useState<
    Record<string, string>
  >({});
  const [capUpdatingBySkillId, setCapUpdatingBySkillId] = useState<
    Record<string, boolean>
  >({});

  const handleToggleEnabled = useCallback(
    async (skillId: string, currentEnabled: boolean) => {
      const nextEnabled = !currentEnabled;

      // Optimistically reflect the new value while the request is in flight.
      setPendingEnabledBySkillId((prev) => ({
        ...prev,
        [skillId]: nextEnabled,
      }));
      setEnabledUpdatingBySkillId((prev) => ({ ...prev, [skillId]: true }));

      const ok = await updateSkillReinforcement(skillId, {
        reinforcement: nextEnabled ? "on" : "off",
      });

      setEnabledUpdatingBySkillId((prev) => withoutSkill(prev, skillId));
      if (!ok) {
        // Roll back the optimistic value so the row falls back to the server state.
        setPendingEnabledBySkillId((prev) => withoutSkill(prev, skillId));
      }
    },
    [updateSkillReinforcement]
  );

  const handleToggleLock = useCallback(
    async (skillId: string, currentLock: boolean) => {
      const nextLock = !currentLock;

      setPendingLockBySkillId((prev) => ({ ...prev, [skillId]: nextLock }));
      setLockUpdatingBySkillId((prev) => ({ ...prev, [skillId]: true }));

      const ok = await updateSkillReinforcement(skillId, {
        selfImprovementLock: nextLock,
      });

      setLockUpdatingBySkillId((prev) => withoutSkill(prev, skillId));
      if (!ok) {
        setPendingLockBySkillId((prev) => withoutSkill(prev, skillId));
      }
    },
    [updateSkillReinforcement]
  );

  const handleCapCommit = useCallback(
    async (skillId: string, savedDollars: number) => {
      const inputValue = capInputBySkillId[skillId];
      if (inputValue === undefined) {
        return;
      }

      const parsed = Number(inputValue);
      const isInvalid =
        inputValue.trim() === "" || !Number.isFinite(parsed) || parsed < 0;
      const isUnchanged = parsed === savedDollars;
      if (isInvalid || isUnchanged) {
        // Drop the local input override so the field falls back to the server value.
        setCapInputBySkillId((prev) => withoutSkill(prev, skillId));
        return;
      }

      setCapUpdatingBySkillId((prev) => ({ ...prev, [skillId]: true }));
      const ok = await updateSkillReinforcement(skillId, {
        selfImprovementCostsCapMicroUsd: dollarsToMicroUsd(parsed),
      });
      setCapUpdatingBySkillId((prev) => withoutSkill(prev, skillId));

      if (ok) {
        // Drop the local override so the row reflects the freshly-mutated server value.
        setCapInputBySkillId((prev) => withoutSkill(prev, skillId));
      }
    },
    [capInputBySkillId, updateSkillReinforcement]
  );

  const [filter, setFilter] = useState("");

  const sortedSkills = useMemo(
    () =>
      [...skillsWithRelations].sort((a, b) => {
        const spentA = spentMicroUsdBySkillId[a.sId] ?? 0;
        const spentB = spentMicroUsdBySkillId[b.sId] ?? 0;
        // Sort by currently spent descending, then by name ascending as tiebreaker.
        if (spentB !== spentA) {
          return spentB - spentA;
        }
        return a.name.localeCompare(b.name);
      }),
    [skillsWithRelations, spentMicroUsdBySkillId]
  );

  const rows: RowData[] = useMemo(
    () =>
      sortedSkills.map((skill: SkillWithRelationsType) => {
        const enabled = isReinforcementEnabled(skill.reinforcement);
        const lock = skill.selfImprovementLock;
        const savedCapDollars = microUsdToDollars(
          skill.selfImprovementCostsCapMicroUsd
        );
        const capInput =
          capInputBySkillId[skill.sId] ?? formatDollars(savedCapDollars);

        return {
          sId: skill.sId,
          name: skill.name,
          icon: skill.icon,
          editors: skill.relations.editors,
          enabled,
          pendingEnabled: pendingEnabledBySkillId[skill.sId] ?? null,
          isEnabledUpdating: enabledUpdatingBySkillId[skill.sId] ?? false,
          lock,
          pendingLock: pendingLockBySkillId[skill.sId] ?? null,
          isLockUpdating: lockUpdatingBySkillId[skill.sId] ?? false,
          currentSpentDollars: microUsdToDollars(
            spentMicroUsdBySkillId[skill.sId] ?? 0
          ),
          capInputValue: capInput,
          isCapUpdating: capUpdatingBySkillId[skill.sId] ?? false,
          onToggleEnabled: () => {
            void handleToggleEnabled(skill.sId, enabled);
          },
          onToggleLock: () => {
            void handleToggleLock(skill.sId, lock);
          },
          onCapChange: (value: string) => {
            setCapInputBySkillId((prev) => ({ ...prev, [skill.sId]: value }));
          },
          onCapCommit: () => {
            void handleCapCommit(skill.sId, savedCapDollars);
          },
        };
      }),
    [
      sortedSkills,
      pendingEnabledBySkillId,
      enabledUpdatingBySkillId,
      pendingLockBySkillId,
      lockUpdatingBySkillId,
      capInputBySkillId,
      capUpdatingBySkillId,
      spentMicroUsdBySkillId,
      handleToggleEnabled,
      handleToggleLock,
      handleCapCommit,
    ]
  );

  return (
    <Page.Vertical align="stretch" gap="md">
      <Page.SectionHeader title="Skills" />
      <SearchInput
        name="skill-search"
        placeholder="Search skills..."
        value={filter}
        onChange={setFilter}
      />
      {isSkillsWithRelationsLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No active skills.
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={COLUMNS}
          filter={filter}
          filterColumn="name"
        />
      )}
    </Page.Vertical>
  );
}
