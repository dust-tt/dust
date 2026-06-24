import { AlertChip } from "@app/components/poke/credits/AlertChip";
import { CreditStateLogsLink } from "@app/components/poke/credits/CreditStateLogsLink";
import { ReconcileCreditStateButton } from "@app/components/poke/credits/ReconcileCreditStateButton";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
import type { MetronomeAlertRef } from "@app/lib/metronome/alerts/types";
import { getMetronomeAlertUrl } from "@app/lib/metronome/urls";
import { usePokeMembersUsage } from "@app/poke/swr/credits";
import type {
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Chip,
  ContentMessage,
  Icon,
  LinkWrapper,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

type SortDirection = "asc" | "desc";

// Explicit, server-driven sort header for the Member (name) column. Toggling
// updates the parent sort state directly (no reliance on react-table's
// manual-sorting toggle), which re-queries the server.
interface MemberSortHeaderProps {
  direction: SortDirection;
  onToggle: () => void;
}

function MemberSortHeader({ direction, onToggle }: MemberSortHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 hover:text-foreground dark:hover:text-foreground-night"
    >
      Member
      <Icon visual={direction === "desc" ? ArrowDown : ArrowUp} size="xs" />
    </button>
  );
}

const DEFAULT_PAGE_SIZE = 25;

const USER_CREDIT_STATE_CHIP_COLOR: Record<
  UserCreditState,
  "success" | "warning" | "rose" | "info"
> = {
  user_seat: "info",
  user_seat_low_balance: "warning",
  normal: "success",
  on_pool: "success",
  on_pool_low_balance: "warning",
  capped: "rose",
};

// Free seats hold a per-user credit with two balance alerts: "low" (≤20%) and
// "empty" (0). Both are shown beside the balance via the shared `AlertChip`,
// colored by each alert's Metronome status (ok = green, in alarm = red) and
// deep-linked. Other seat types draw from the pool and have no such alerts.
interface FreeSeatBalanceBadgesProps {
  seatType: MembershipSeatType | null;
  lowAlert: MetronomeAlertRef | null;
  emptyAlert: MetronomeAlertRef | null;
}

function FreeSeatBalanceBadges({
  seatType,
  lowAlert,
  emptyAlert,
}: FreeSeatBalanceBadgesProps) {
  if (seatType !== "free") {
    return null;
  }
  return (
    <>
      <AlertChip alert={lowAlert} label="low" />
      <AlertChip alert={emptyAlert} label="empty" />
    </>
  );
}

interface PokeMembersUsageTableProps {
  owner: WorkspaceType;
}

function makeColumns({
  owner,
  onReconciled,
  nameSortDirection,
  onToggleNameSort,
}: {
  owner: WorkspaceType;
  onReconciled: () => void;
  nameSortDirection: SortDirection;
  onToggleNameSort: () => void;
}): ColumnDef<MemberUsageType>[] {
  return [
    {
      accessorKey: "name",
      enableSorting: false,
      header: () => (
        <MemberSortHeader
          direction={nameSortDirection}
          onToggle={onToggleNameSort}
        />
      ),
      cell: ({ row }) => {
        const { name, email } = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{name}</span>
            {email && email !== name && (
              <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                {email}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "seatType",
      header: "Seat type",
      enableSorting: false,
      cell: ({ row }) => <span>{row.original.seatType ?? "-"}</span>,
    },
    {
      accessorKey: "consumedAwuCredits",
      header: "Consumed",
      enableSorting: false,
      cell: ({ row }) => (
        <span>{formatCredits(row.original.consumedAwuCredits)}</span>
      ),
    },
    {
      accessorKey: "spendLimitAwuCredits",
      header: "User cap",
      enableSorting: false,
      cell: ({ row }) => {
        const {
          spendLimitAwuCredits,
          spendLimitSource,
          spendLimitAlertId,
          spendLimitWarningAlertId,
        } = row.original;
        if (spendLimitAwuCredits === null) {
          return <span>—</span>;
        }
        const sourceLabel = `(${spendLimitSource})`;
        return (
          <span className="inline-flex items-center gap-1">
            {formatCredits(spendLimitAwuCredits)}
            {spendLimitAlertId ? (
              <LinkWrapper
                href={getMetronomeAlertUrl(spendLimitAlertId)}
                target="_blank"
                className="text-xs text-highlight-400"
              >
                {sourceLabel}
              </LinkWrapper>
            ) : (
              <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                {sourceLabel}
              </span>
            )}
            {spendLimitWarningAlertId ? (
              <LinkWrapper
                href={getMetronomeAlertUrl(spendLimitWarningAlertId)}
                target="_blank"
                className="text-xs text-highlight-400"
              >
                80%
              </LinkWrapper>
            ) : null}
          </span>
        );
      },
    },
    {
      accessorKey: "memberUsageLimit",
      header: "Seat balance / allowance",
      enableSorting: false,
      cell: ({ row }) => {
        const {
          memberUsageLimit,
          seatBalanceAwu,
          seatType,
          freeCreditLowAlert,
          freeCreditEmptyAlert,
        } = row.original;
        if (memberUsageLimit === null) {
          return <span>-</span>;
        }
        return (
          <span className="inline-flex items-center gap-1">
            {seatBalanceAwu !== null ? formatCredits(seatBalanceAwu) : "-"}
            {" / "}
            {formatCredits(memberUsageLimit)}
            <FreeSeatBalanceBadges
              seatType={seatType}
              lowAlert={freeCreditLowAlert}
              emptyAlert={freeCreditEmptyAlert}
            />
          </span>
        );
      },
    },
    {
      accessorKey: "creditState",
      header: "Credit state",
      enableSorting: false,
      cell: ({ row }) => {
        const { creditState, nearLimit, sId } = row.original;
        return (
          <span className="inline-flex items-center gap-2">
            <Chip
              size="xs"
              color={USER_CREDIT_STATE_CHIP_COLOR[creditState] ?? "info"}
              label={creditState}
            />
            {nearLimit && <Chip size="xs" color="warning" label="near limit" />}
            <CreditStateLogsLink
              machine="user"
              workspaceId={owner.sId}
              userId={sId}
            />
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => null,
      enableSorting: false,
      cell: ({ row }) => (
        <ReconcileCreditStateButton
          owner={owner}
          target="user"
          userId={row.original.sId}
          onReconciled={onReconciled}
        />
      ),
    },
  ];
}

export function PokeMembersUsageTable({ owner }: PokeMembersUsageTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  // Only name sorting is supported (server-side). Default: name ascending.
  const [orderDirection, setOrderDirection] = useState<SortDirection>("asc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Debounce the search input, and reset to the first page on a new query.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const {
    members,
    totalMembers,
    isMembersUsageLoading,
    isMembersUsageError,
    mutateMembersUsage,
  } = usePokeMembersUsage({
    owner,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    search,
    orderColumn: "name",
    orderDirection,
  });

  // Toggle name sort direction and jump back to the first page. Stable across
  // renders (only uses functional setters), so it's safe in the columns memo.
  const toggleNameSort = useCallback(() => {
    setOrderDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const columns = useMemo(
    () =>
      makeColumns({
        owner,
        onReconciled: () => void mutateMembersUsage(),
        nameSortDirection: orderDirection,
        onToggleNameSort: toggleNameSort,
      }),
    [owner, mutateMembersUsage, orderDirection, toggleNameSort]
  );

  if (isMembersUsageError) {
    return (
      <ContentMessage
        title="Failed to load members usage"
        icon={AlertCircle}
        variant="warning"
      >
        Could not load per-member seat, balance and credit-state data for this
        workspace.
      </ContentMessage>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4 dark:border-border-night">
      <span className="text-sm font-medium text-foreground dark:text-foreground-night">
        Members credit states
      </span>
      <PokeDataTable
        columns={columns}
        data={members}
        isLoading={isMembersUsageLoading}
        serverSideRowCount={totalMembers}
        pagination={pagination}
        onPaginationChange={setPagination}
        search={searchInput}
        onSearchChange={setSearchInput}
      />
    </div>
  );
}
