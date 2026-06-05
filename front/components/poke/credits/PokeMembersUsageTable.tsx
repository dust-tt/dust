import { CreditStateLogsLink } from "@app/components/poke/credits/CreditStateLogsLink";
import { ReconcileCreditStateButton } from "@app/components/poke/credits/ReconcileCreditStateButton";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { getMetronomeAlertUrl } from "@app/lib/metronome/urls";
import { usePokeMembersUsage } from "@app/poke/swr/credits";
import type { UserCreditState } from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  Chip,
  ContentMessage,
  LinkWrapper,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

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

interface PokeMembersUsageTableProps {
  owner: WorkspaceType;
}

function makeColumns({
  owner,
  onReconciled,
}: {
  owner: WorkspaceType;
  onReconciled: () => void;
}): ColumnDef<MemberUsageType>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Member" />
      ),
      cell: ({ row }) => {
        const { name, email } = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{name}</span>
            {email && (
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
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Seat type" />
      ),
      cell: ({ row }) => {
        const { seatType } = row.original;
        return <span>{seatType ?? "-"}</span>;
      },
    },
    {
      accessorKey: "consumedAwuCredits",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Consumed" />
      ),
      cell: ({ row }) => {
        const { consumedAwuCredits } = row.original;
        return <span>{formatCredits(consumedAwuCredits)}</span>;
      },
    },
    {
      accessorKey: "spendLimitAwuCredits",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="User cap" />
      ),
      cell: ({ row }) => {
        const {
          spendLimitAwuCredits,
          spendLimitSource,
          spendLimitAlertId,
          spendLimitWarningAlertId,
        } = row.original;
        if (spendLimitAwuCredits === null) {
          return <span>unlimited</span>;
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
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Seat allowance" />
      ),
      cell: ({ row }) => {
        const { memberUsageLimit } = row.original;
        return (
          <span>
            {memberUsageLimit !== null ? formatCredits(memberUsageLimit) : "-"}
          </span>
        );
      },
    },
    {
      accessorKey: "creditState",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Credit state" />
      ),
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
      cell: ({ row }) => {
        const { creditState, sId } = row.original;
        return (
          <span className="inline-flex items-center gap-2">
            <Chip
              size="xs"
              color={USER_CREDIT_STATE_CHIP_COLOR[creditState] ?? "info"}
              label={creditState}
            />
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
  const {
    members,
    isMembersUsageLoading,
    isMembersUsageError,
    mutateMembersUsage,
  } = usePokeMembersUsage({ owner });

  const columns = useMemo(
    () => makeColumns({ owner, onReconciled: () => void mutateMembersUsage() }),
    [owner, mutateMembersUsage]
  );

  if (isMembersUsageLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

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
      <PokeDataTable columns={columns} data={members} />
    </div>
  );
}
