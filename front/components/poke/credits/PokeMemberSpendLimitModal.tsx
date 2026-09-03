import { useSendNotification } from "@app/hooks/useNotification";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
import type { GroupType } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";
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
import { useEffect, useMemo, useRef, useState } from "react";

interface PokeMemberSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
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

export function PokeMemberSpendLimitModal({
  isOpen,
  onClose,
  member,
  groups,
}: PokeMemberSpendLimitModalProps) {
  // Keep the last non-null member so the dialog can render its content
  // through the exit animation after the parent has cleared `member`.
  const lastMemberRef = useRef<MemberUsageType | null>(null);
  useEffect(() => {
    if (member) {
      lastMemberRef.current = member;
    }
  }, [member]);
  const displayedMember = member ?? lastMemberRef.current;

  const sendNotification = useSendNotification();
  // Poke has no working write route for per-member or per-group spend
  // limits yet, so Save is wired to nothing but a notice rather than an
  // actual mutation.
  const notifySaveUnavailable = () =>
    sendNotification({
      title: "Not available from Poke yet",
      description: "Editing spend limits from Poke isn't supported yet.",
      type: "info",
    });

  const [personalLimitInput, setPersonalLimitInput] = useState<string>("");
  // Typed group overrides aren't read anywhere yet (Save is a no-op notice,
  // not a real mutation), so they're kept in a ref rather than state
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

  const memberGroups: GroupType[] = removeNulls(
    (displayedMember?.groups ?? []).map((groupName) =>
      groups.find((g) => g.name === groupName)
    )
  );

  // When there's no personal override, the highest group cap the member is
  // part of is the one currently granting their extra credits.
  const highestGroupId = memberGroups.reduce<string | null>(
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
    isHighest: !hasPersonalOverride && g.sId === highestGroupId,
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
                  ? "font-semibold text-highlight-500"
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
              groupLimitInputsRef.current[row.original.sId] = cleaned;
            }}
            suffix="credits/m."
            isUnit
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
                seat, plus {formatCredits(extraAwuCredits)} on the&nbsp;pool.
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
                suffix="credits/months"
                isUnit
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
