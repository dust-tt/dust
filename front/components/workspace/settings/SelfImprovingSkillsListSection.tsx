import {
  capUnitLabel,
  normalizeCapInput,
} from "@app/components/workspace/settings/SelfImprovingSkillsSettingsSection";
import { formatCredits } from "@app/lib/client/credits";
import type { ReinforcementBillingUnit } from "@app/lib/reinforcement/enforcement";
import { getSkillAvatarIcon } from "@app/lib/skill";
import {
  useSkillsWithRelations,
  useUpdateSkillReinforcement,
} from "@app/lib/swr/skill_configurations";
import {
  useReinforcementBillingUnit,
  useSkillsSelfImprovingSpend,
} from "@app/lib/swr/useSelfImprovingSkillsSettings";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type {
  SkillReinforcementMode,
  SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  DataTable,
  InputWithSave,
  Page,
  SearchInput,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

interface SelfImprovingSkillsListSectionProps {
  owner: LightWorkspaceType;
  // In the display unit: AWU credits for workspaces billed by Metronome,
  // dollars otherwise.
  defaultCapPerSkill: number;
}

type RowData = {
  sId: string;
  name: string;
  icon: string | null;
  editedBy: number | null;
  editors: UserType[] | null;
  enabled: boolean;
  pendingEnabled: boolean | null;
  isEnabledUpdating: boolean;
  lock: boolean;
  pendingLock: boolean | null;
  isLockUpdating: boolean;
  currentSpent: number;
  currentSpentFormatted: string;
  // Saved cap in the display unit, "" when using the workspace default.
  savedCapValue: string;
  capPlaceholder: string;
  onToggleEnabled: () => void;
  onToggleLock: () => void;
  onCapSave: (value: string) => Promise<void>;
  onClick?: () => void;
};

function isReinforcementEnabled(
  reinforcement: SkillReinforcementMode
): boolean {
  // "auto" (the default) and "on" both render as enabled. Only "off" disables.
  return reinforcement !== "off";
}

function getColumns(
  unit: ReinforcementBillingUnit
): ColumnDef<RowData, unknown>[] {
  // "(credits)" goes on its own line: the single-line header is too wide and
  // overlaps the neighboring columns.
  const headerWithUnit = (label: string) =>
    unit === "awu_credits"
      ? () => (
          <>
            {label}
            <br />
            (credits)
          </>
        )
      : `${label} ($)`;
  return [
    {
      header: "Name",
      accessorKey: "name",
      cell: (info: CellContext<RowData, unknown>) => {
        const SkillAvatar = getSkillAvatarIcon(info.row.original);
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
        const {
          enabled,
          pendingEnabled,
          isEnabledUpdating,
          lock,
          pendingLock,
          onToggleEnabled,
        } = info.row.original;
        const selected = pendingEnabled ?? enabled;
        const isLocked = pendingLock ?? lock;
        return (
          <DataTable.CellContent>
            <SliderToggle
              size="xs"
              selected={selected}
              disabled={isEnabledUpdating || isLocked}
              onClick={onToggleEnabled}
            />
          </DataTable.CellContent>
        );
      },
      meta: { className: "w-24" },
    },
    {
      header: headerWithUnit("Currently Spent"),
      accessorKey: "currentSpent",
      cell: (info: CellContext<RowData, unknown>) => (
        <DataTable.BasicCellContent
          label={info.row.original.currentSpentFormatted}
        />
      ),
      meta: { className: "w-32" },
    },
    {
      header: headerWithUnit("Cap"),
      accessorKey: "savedCapValue",
      cell: (info: CellContext<RowData, unknown>) => {
        const { sId, savedCapValue, capPlaceholder, onCapSave } =
          info.row.original;
        return (
          <DataTable.CellContent>
            <InputWithSave
              name={`cap-${sId}`}
              inputMode={unit === "awu_credits" ? "numeric" : "decimal"}
              value={savedCapValue}
              placeholder={capPlaceholder}
              unit={capUnitLabel(unit)}
              normalizeValue={(value) => normalizeCapInput(value, unit)}
              onSave={onCapSave}
            />
          </DataTable.CellContent>
        );
      },
      meta: { className: unit === "awu_credits" ? "w-48" : "w-40" },
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
  ];
}

function formatDollars(value: number): string {
  if (value === 0) {
    return "0";
  }
  // Show up to 2 decimals, trimming trailing zeros.
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatSpend(value: number, unit: ReinforcementBillingUnit): string {
  return unit === "awu_credits" ? formatCredits(value) : formatDollars(value);
}

// Plain (unformatted) value for cap inputs: thousands separators would not
// round-trip through Number().
function capInputValueFromSaved(
  value: number,
  unit: ReinforcementBillingUnit
): string {
  return unit === "awu_credits" ? String(value) : formatDollars(value);
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

export function SelfImprovingSkillsListSection({
  owner,
  defaultCapPerSkill,
}: SelfImprovingSkillsListSectionProps) {
  const unit = useReinforcementBillingUnit({ owner });
  const { skillsWithRelations, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({ owner, status: "active", onlyCustom: true });
  const { spentMicroUsdBySkillId, spentAwuCreditsBySkillId } =
    useSkillsSelfImprovingSpend({ owner });
  const { updateSkillReinforcement } = useUpdateSkillReinforcement({
    owner,
    onlyCustom: true,
  });

  // Spend per skill in the display unit.
  const spentBySkillId = useMemo(
    () =>
      unit === "awu_credits"
        ? spentAwuCreditsBySkillId
        : Object.fromEntries(
            Object.entries(spentMicroUsdBySkillId).map(([skillId, spent]) => [
              skillId,
              microUsdToDollars(spent),
            ])
          ),
    [unit, spentMicroUsdBySkillId, spentAwuCreditsBySkillId]
  );

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

  // `savedCap` is the skill's saved cap in the display unit (null when using
  // the workspace default). Throws on failed updates so InputWithSave stays
  // in editing mode (the SWR hook already sent the error notification).
  const handleCapSave = useCallback(
    async (skillId: string, savedCap: number | null, newValue: string) => {
      const capUpdate = (value: number | null) =>
        unit === "awu_credits"
          ? {
              selfImprovementCostsCapAwuCredits:
                value === null ? null : Math.round(value),
            }
          : {
              selfImprovementCostsCapMicroUsd:
                value === null ? null : dollarsToMicroUsd(value),
            };

      const trimmed = newValue.trim();

      // Empty input resets to default (null).
      if (trimmed === "") {
        if (savedCap === null) {
          // Already using default.
          return;
        }
        const ok = await updateSkillReinforcement(skillId, capUpdate(null));
        if (!ok) {
          throw new Error("Failed to reset the per-skill cap");
        }
        return;
      }

      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        // Let the field revert to the server value.
        return;
      }
      if (savedCap !== null && parsed === savedCap) {
        return;
      }

      const ok = await updateSkillReinforcement(skillId, capUpdate(parsed));
      if (!ok) {
        throw new Error("Failed to update the per-skill cap");
      }
    },
    [updateSkillReinforcement, unit]
  );

  const [filter, setFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const sortedSkills = useMemo(
    () =>
      [...skillsWithRelations].sort((a, b) => {
        const spentA = spentBySkillId[a.sId] ?? 0;
        const spentB = spentBySkillId[b.sId] ?? 0;
        // Sort by currently spent descending, then by name ascending as tiebreaker.
        if (spentB !== spentA) {
          return spentB - spentA;
        }
        return a.name.localeCompare(b.name);
      }),
    [skillsWithRelations, spentBySkillId]
  );

  const columns = useMemo(() => getColumns(unit), [unit]);

  const defaultCapPlaceholder = `${capInputValueFromSaved(defaultCapPerSkill, unit)} (default)`;

  const rows: RowData[] = useMemo(
    () =>
      sortedSkills.map(
        (skill: SkillWithoutInstructionsAndToolsWithRelationsType) => {
          const enabled = isReinforcementEnabled(skill.reinforcement);
          const lock = skill.selfImprovementLock;
          // Saved cap in the display unit.
          const savedCap =
            unit === "awu_credits"
              ? skill.selfImprovementCostsCapAwuCredits
              : skill.selfImprovementCostsCapMicroUsd !== null
                ? microUsdToDollars(skill.selfImprovementCostsCapMicroUsd)
                : null;
          const currentSpent = spentBySkillId[skill.sId] ?? 0;

          return {
            sId: skill.sId,
            name: skill.name,
            icon: skill.icon,
            editedBy: skill.editedBy,
            editors: skill.relations.editors,
            enabled,
            pendingEnabled: pendingEnabledBySkillId[skill.sId] ?? null,
            isEnabledUpdating: enabledUpdatingBySkillId[skill.sId] ?? false,
            lock,
            pendingLock: pendingLockBySkillId[skill.sId] ?? null,
            isLockUpdating: lockUpdatingBySkillId[skill.sId] ?? false,
            currentSpent,
            currentSpentFormatted: formatSpend(currentSpent, unit),
            savedCapValue:
              savedCap !== null ? capInputValueFromSaved(savedCap, unit) : "",
            capPlaceholder: defaultCapPlaceholder,
            onToggleEnabled: () => {
              void handleToggleEnabled(skill.sId, enabled);
            },
            onToggleLock: () => {
              void handleToggleLock(skill.sId, lock);
            },
            onCapSave: (value: string) =>
              handleCapSave(skill.sId, savedCap, value),
          };
        }
      ),
    [
      sortedSkills,
      defaultCapPlaceholder,
      pendingEnabledBySkillId,
      enabledUpdatingBySkillId,
      pendingLockBySkillId,
      lockUpdatingBySkillId,
      spentBySkillId,
      unit,
      handleToggleEnabled,
      handleToggleLock,
      handleCapSave,
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
          columns={columns}
          filter={filter}
          filterColumn="name"
          pagination={pagination}
          setPagination={setPagination}
        />
      )}
    </Page.Vertical>
  );
}
