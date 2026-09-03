import { useSendNotification } from "@app/hooks/useNotification";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
import type { GroupType } from "@app/types/groups";
import {
  Avatar,
  Chip,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Page,
  Users01,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";

interface PokeMemberSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  // Cap-eligible groups for the workspace, already fetched by the caller
  // (e.g. PoolUsagePage's usePokeGroups) — filtered here to the member's own
  // groups.
  groups: GroupType[];
}

type GroupRow = {
  sId: string;
  name: string;
  poolCapAwuCredits: number | null;
  memberCount: number;
  isHighest: boolean;
  onClick?: () => void;
};

// Poke has no working write route for per-member or per-group spend limits
// yet, so Save is wired to nothing but a notice rather than an actual
// mutation — see the "Unblock" panel this modal is opened from.
function useUnavailableSpendLimitSave() {
  const sendNotification = useSendNotification();
  return () =>
    sendNotification({
      title: "Not available from Poke yet",
      description: "Editing spend limits from Poke isn't supported yet.",
      type: "info",
    });
}

export function PokeMemberSpendLimitModal({
  isOpen,
  onClose,
  member,
  groups,
}: PokeMemberSpendLimitModalProps) {
  // Keep the last non-null member so the dialog can render its content
  // through the exit animation after the parent has cleared `member`.
  const lastMemberRef = useRef<MemberUsageType | null>(null);
  if (member) {
    lastMemberRef.current = member;
  }
  const displayedMember = member ?? lastMemberRef.current;

  const notifySaveUnavailable = useUnavailableSpendLimitSave();

  const [personalLimitInput, setPersonalLimitInput] = useState("");
  // Typed group overrides aren't read anywhere yet (Save is a no-op notice,
  // not a real mutation), so they're kept in a ref rather than state — a
  // state update on every keystroke would recreate `groupColumns` below and
  // remount the DataTable's input cells, kicking focus out after each
  // character.
  const groupLimitInputsRef = useRef<Record<string, string>>({});

  const seatAllowanceAwuCredits = displayedMember?.memberUsageLimit ?? 0;
  const effectiveLimitAwuCredits = displayedMember?.spendLimitAwuCredits ?? 0;
  const extraAwuCredits = Math.max(
    0,
    effectiveLimitAwuCredits - seatAllowanceAwuCredits
  );

  const hasPersonalOverride = displayedMember?.spendLimitSource === "override";
  const personalLimitPlaceholder = hasPersonalOverride
    ? String(extraAwuCredits)
    : "0";

  const memberGroups: GroupType[] = (displayedMember?.groups ?? [])
    .map((groupName) => groups.find((g) => g.name === groupName))
    .filter((g): g is GroupType => g !== undefined);

  // When there's no personal override, the highest group cap the member is
  // part of is the one currently granting their extra credits.
  const highestGroupSId = memberGroups.reduce<string | null>(
    (highestSId, g) => {
      if (g.poolCapAwuCredits === null) {
        return highestSId;
      }
      const highest = memberGroups.find((h) => h.sId === highestSId);
      if (!highest || g.poolCapAwuCredits > (highest.poolCapAwuCredits ?? -1)) {
        return g.sId;
      }
      return highestSId;
    },
    null
  );

  const memberGroupRows: GroupRow[] = memberGroups.map((g) => ({
    sId: g.sId,
    name: g.name,
    poolCapAwuCredits: g.poolCapAwuCredits,
    memberCount: g.memberCount,
    isHighest: !hasPersonalOverride && g.sId === highestGroupSId,
  }));

  const groupColumns: ColumnDef<GroupRow, string>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Group",
        accessorFn: (row) => row.name,
        cell: ({ row }) => (
          <DataTable.CellContent>
            <span
              className={
                row.original.isHighest
                  ? "font-semibold text-emerald-600"
                  : undefined
              }
            >
              {row.original.name}
            </span>
          </DataTable.CellContent>
        ),
      },
      {
        id: "poolCapAwuCredits",
        header: "Limit",
        accessorFn: (row) => String(row.poolCapAwuCredits ?? ""),
        meta: { className: "w-40" },
        cell: ({ row }) => (
          <Input
            size="xs"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={String(row.original.poolCapAwuCredits ?? 0)}
            defaultValue={groupLimitInputsRef.current[row.original.sId] ?? ""}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^\d]/g, "");
              e.target.value = cleaned;
              groupLimitInputsRef.current[row.original.sId] = cleaned;
            }}
            unit="credits/m."
          />
        ),
      },
      {
        id: "memberCount",
        header: "Members",
        accessorFn: (row) => row.memberCount.toString(),
        meta: { headerAlign: "right" },
        cell: ({ row }) => (
          <span className="block text-right text-sm text-muted-foreground">
            {row.original.memberCount.toLocaleString()}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="font-sans">
        <DialogHeader>
          <div className="flex flex-col gap-2">
            <Avatar
              visual={displayedMember?.image ?? undefined}
              name={displayedMember?.name}
              size="md"
              isRounded
            />
            <div>
              <DialogTitle>
                Edit spend limit for {displayedMember?.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                This user can currently consume{" "}
                {formatCredits(seatAllowanceAwuCredits)} credits from their
                seat, plus {formatCredits(extraAwuCredits)} on the pool.
              </p>
            </div>
          </div>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-5">
            <Page.Vertical gap="xs" align="stretch">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  Personal limit
                </span>
                {hasPersonalOverride && (
                  <Chip size="mini" color="highlight" label="Highest" />
                )}
              </div>
              <Input
                size="sm"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={personalLimitPlaceholder}
                value={personalLimitInput}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d]/g, "");
                  setPersonalLimitInput(cleaned);
                }}
                unit="credits/months"
              />
            </Page.Vertical>

            {memberGroupRows.length > 0 && (
              <Page.Vertical gap="xs" align="stretch">
                <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                  <Icon visual={Users01} size="xs" />
                  Group limit
                </span>
                <DataTable data={memberGroupRows} columns={groupColumns} />
              </Page.Vertical>
            )}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Validate",
            variant: "highlight",
            onClick: notifySaveUnavailable,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
