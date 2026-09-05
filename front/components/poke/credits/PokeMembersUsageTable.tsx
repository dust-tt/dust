import { AlertChip } from "@app/components/poke/credits/AlertChip";
import { CreditStateLogsLink } from "@app/components/poke/credits/CreditStateLogsLink";
import { GrantFreeCreditsButton } from "@app/components/poke/credits/GrantFreeCreditsButton";
import { MemberConsumptionExportButton } from "@app/components/poke/credits/MemberConsumptionExportButton";
import { RateLimiterStateChip } from "@app/components/poke/credits/RateLimiterStateChip";
import { ReconcileCreditStateButton } from "@app/components/poke/credits/ReconcileCreditStateButton";
import { ResetFairUseButton } from "@app/components/poke/credits/ResetFairUseButton";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits, formatCreditsPrecise } from "@app/lib/client/credits";
import type { MetronomeAlertRef } from "@app/lib/metronome/alerts/types";
import { getMetronomeAlertUrl } from "@app/lib/metronome/urls";
import { usePokeMembersUsage } from "@app/poke/swr/credits";
import type {
  MembershipSeatType,
  UserCreditState,
} from "@app/types/memberships";
import {
  MEMBERSHIP_SEAT_TYPES,
  USER_CREDIT_STATES,
} from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Button,
  Chip,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  LinkWrapper,
} from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

type SortDirection = "asc" | "desc";

type OrderColumn = "name" | "seatType" | "consumedAwuCredits" | "creditState";

// Explicit, server-driven sort header. Toggling updates the parent sort state
// directly (no reliance on react-table's manual-sorting toggle), which
// re-queries the server. Clicking a non-active column switches to it
// (ascending); clicking the active column flips its direction.
interface SortableHeaderProps {
  label: string;
  column: OrderColumn;
  activeColumn: OrderColumn;
  direction: SortDirection;
  onToggle: (column: OrderColumn) => void;
}

function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onToggle,
}: SortableHeaderProps) {
  const isActive = column === activeColumn;
  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className="flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {isActive && (
        <Icon visual={direction === "desc" ? ArrowDown : ArrowUp} size="xs" />
      )}
    </button>
  );
}

interface EnumFilterDropdownProps<T extends string> {
  label: string;
  value: T | undefined;
  options: readonly T[];
  onChange: (value: T | undefined) => void;
}

// Single-value filter dropdown, mirroring the backend's single-value
// `seatType`/`creditState` query params (not a multi-select facet).
function EnumFilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: EnumFilterDropdownProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          isSelect
          label={value ? `${label}: ${value}` : label}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => onChange(undefined)}
          disabled={value === undefined}
        >
          All
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => onChange(option)}
            disabled={value === option}
          >
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DEFAULT_PAGE_SIZE = 25;

const USER_CREDIT_STATE_CHIP_COLOR: Record<
  UserCreditState,
  "success" | "warning" | "warning" | "info"
> = {
  user_seat: "info",
  user_seat_low_balance: "warning",
  normal: "success",
  on_pool: "success",
  on_pool_low_balance: "warning",
  capped: "warning",
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
  // Credit-priced workspaces (Metronome contract). Gates the credit-only
  // columns (user cap, seat balance/allowance, credit state), which are
  // meaningless for non-credit workspaces.
  isCreditBased: boolean;
}

function makeColumns({
  owner,
  onReconciled,
  orderColumn,
  orderDirection,
  onToggleSort,
  showFairUse,
  showCreditColumns,
}: {
  owner: WorkspaceType;
  onReconciled: () => void;
  orderColumn: OrderColumn;
  orderDirection: SortDirection;
  onToggleSort: (column: OrderColumn) => void;
  showFairUse: boolean;
  showCreditColumns: boolean;
}): ColumnDef<MemberUsageType>[] {
  const columns: ColumnDef<MemberUsageType>[] = [
    {
      accessorKey: "name",
      enableSorting: false,
      header: () => (
        <SortableHeader
          label="Member"
          column="name"
          activeColumn={orderColumn}
          direction={orderDirection}
          onToggle={onToggleSort}
        />
      ),
      cell: ({ row }) => {
        const { name, email } = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{name}</span>
            {email && email !== name && (
              <span className="text-xs text-muted-foreground">{email}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "seatType",
      header: () => (
        <SortableHeader
          label="Seat type"
          column="seatType"
          activeColumn={orderColumn}
          direction={orderDirection}
          onToggle={onToggleSort}
        />
      ),
      enableSorting: false,
      cell: ({ row }) => <span>{row.original.seatType ?? "-"}</span>,
    },
    {
      accessorKey: "consumedAwuCredits",
      // ES = Elasticsearch, RL = Redis rate-limiter counter, MT = Metronome.
      // The three should agree; divergence points at a counter/metric issue.
      // Non-credit workspaces have no RL/MT counters, so only ES is shown.
      // Sorting is driven by the ES figure (see resolveMembersUsagePageUsers).
      header: () => (
        <SortableHeader
          label={showCreditColumns ? "Consumed (ES / RL / MT)" : "Consumed"}
          column="consumedAwuCredits"
          activeColumn={orderColumn}
          direction={orderDirection}
          onToggle={onToggleSort}
        />
      ),
      enableSorting: false,
      cell: ({ row }) => {
        const {
          consumedAwuCredits,
          rateLimiterSpendAwuCredits,
          metronomeConsumedAwuCredits,
          sId,
        } = row.original;
        if (!showCreditColumns) {
          return <span>{formatCreditsPrecise(consumedAwuCredits)}</span>;
        }
        return (
          <div className="flex items-center gap-1">
            <div className="flex flex-col text-xs">
              <span>ES {formatCreditsPrecise(consumedAwuCredits)}</span>
              <span className="text-muted-foreground">
                RL{" "}
                {rateLimiterSpendAwuCredits !== null
                  ? formatCreditsPrecise(rateLimiterSpendAwuCredits)
                  : "-"}
              </span>
              <span className="text-muted-foreground">
                MT{" "}
                {metronomeConsumedAwuCredits !== null
                  ? formatCreditsPrecise(metronomeConsumedAwuCredits)
                  : "-"}
              </span>
            </div>
            <MemberConsumptionExportButton owner={owner} userId={sId} />
          </div>
        );
      },
    },
    {
      id: "fairUse",
      // Per-user fair-use AWU usage (used / limit, credits). Applies to
      // non-credit-based plans (free/trial); "—" when the plan carries no
      // fair-use limit.
      header: "Fair-use",
      enableSorting: false,
      cell: ({ row }) => {
        const { fairUse } = row.original;
        if (!fairUse) {
          return <span>—</span>;
        }
        return (
          <span>
            {formatCreditsPrecise(fairUse.usedCredits)} /{" "}
            {formatCreditsPrecise(fairUse.limitCredits)}
          </span>
        );
      },
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
              <span className="text-xs text-muted-foreground">
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
      header: () => (
        <SortableHeader
          label="Credit state"
          column="creditState"
          activeColumn={orderColumn}
          direction={orderDirection}
          onToggle={onToggleSort}
        />
      ),
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
      accessorKey: "rateLimiterState",
      header: "Rate limiter state",
      enableSorting: false,
      cell: ({ row }) => {
        return (
          <RateLimiterStateChip
            rateLimiterState={row.original.rateLimiterState}
          />
        );
      },
    },
    {
      id: "actions",
      header: () => null,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          {row.original.fairUse && row.original.email && (
            <ResetFairUseButton
              owner={owner}
              userEmail={row.original.email}
              onReset={onReconciled}
            />
          )}
          {row.original.seatType === "free" && (
            <GrantFreeCreditsButton
              owner={owner}
              userId={row.original.sId}
              memberName={row.original.name}
              onGranted={onReconciled}
            />
          )}
          {showCreditColumns && (
            <ReconcileCreditStateButton
              owner={owner}
              target="user"
              userId={row.original.sId}
              onReconciled={onReconciled}
            />
          )}
        </div>
      ),
    },
  ];

  return columns.filter((col) => {
    const key =
      "accessorKey" in col && typeof col.accessorKey === "string"
        ? col.accessorKey
        : (col.id ?? "");
    if (key === "fairUse") {
      return showFairUse;
    }
    if (
      key === "spendLimitAwuCredits" ||
      key === "memberUsageLimit" ||
      key === "creditState"
    ) {
      return showCreditColumns;
    }
    return true;
  });
}

export function PokeMembersUsageTable({
  owner,
  isCreditBased,
}: PokeMembersUsageTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  // Sorting is server-side and single-column. Default: name ascending.
  const [orderColumn, setOrderColumn] = useState<OrderColumn>("name");
  const [orderDirection, setOrderDirection] = useState<SortDirection>("asc");
  const [seatTypeFilter, setSeatTypeFilter] = useState<
    MembershipSeatType | undefined
  >(undefined);
  const [creditStateFilter, setCreditStateFilter] = useState<
    UserCreditState | undefined
  >(undefined);
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
    orderColumn,
    orderDirection,
    seatType: seatTypeFilter,
    creditState: creditStateFilter,
  });

  // Switching to a new sort column resets to ascending; clicking the already-
  // active column flips its direction. Jumps back to the first page either
  // way. Depends on `orderColumn` (read to detect the "same column" case), so
  // it's recreated when the active column changes.
  const toggleSort = useCallback(
    (column: OrderColumn) => {
      if (column === orderColumn) {
        setOrderDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setOrderColumn(column);
        setOrderDirection("asc");
      }
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    [orderColumn]
  );

  const handleSeatTypeFilterChange = useCallback(
    (value: MembershipSeatType | undefined) => {
      setSeatTypeFilter(value);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    []
  );

  const handleCreditStateFilterChange = useCallback(
    (value: UserCreditState | undefined) => {
      setCreditStateFilter(value);
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    },
    []
  );

  // The fair-use limit is plan-level, so it's uniform across members: show the
  // column when any member carries a fair-use limit (i.e. the plan has one).
  const showFairUse = members.some((m) => Boolean(m.fairUse));

  const columns = useMemo(
    () =>
      makeColumns({
        owner,
        onReconciled: () => void mutateMembersUsage(),
        orderColumn,
        orderDirection,
        onToggleSort: toggleSort,
        showFairUse,
        showCreditColumns: isCreditBased,
      }),
    [
      owner,
      mutateMembersUsage,
      orderColumn,
      orderDirection,
      toggleSort,
      showFairUse,
      isCreditBased,
    ]
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
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <span className="text-sm font-medium text-foreground">
        Members credit states
      </span>
      <div className="flex items-center gap-2">
        <EnumFilterDropdown
          label="Seat type"
          value={seatTypeFilter}
          options={MEMBERSHIP_SEAT_TYPES}
          onChange={handleSeatTypeFilterChange}
        />
        {isCreditBased && (
          <EnumFilterDropdown
            label="Credit state"
            value={creditStateFilter}
            options={USER_CREDIT_STATES}
            onChange={handleCreditStateFilterChange}
          />
        )}
      </div>
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
