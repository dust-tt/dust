import {
  buildMemberNameColumn,
  MemberNameSkeleton,
} from "@app/components/workspace/member_name_column";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { timeAgoFrom } from "@app/lib/client/relative_time";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { DataTableSkeletonCellProps } from "@dust-tt/sparkle";
import {
  Button,
  Check,
  DataTable,
  DataTableSkeleton,
  LoadingBlock,
  Spinner,
  XClose,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import type { ReactNode } from "react";

type RowData = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  createdAt: number;
  request: MembershipUpgradeRequestType;
  isPending: boolean;
  // Rows are not clickable (actions live in explicit buttons), but DataTable's
  // row type requires at least one of its optional fields to be present.
  onClick?: () => void;
};

type Info = CellContext<RowData, string>;

function UpgradeRequestSkeletonCell({
  columnId,
  rowIndex,
}: DataTableSkeletonCellProps) {
  switch (columnId) {
    case "name":
      return <MemberNameSkeleton rowIndex={rowIndex} />;
    case "reason":
      return <LoadingBlock className="h-3 w-40 max-w-full" />;
    case "requested":
      return <LoadingBlock className="h-3 w-20" />;
    case "actions":
      return (
        <div className="flex items-center justify-end gap-2">
          <LoadingBlock className="h-8 w-20 rounded-xl" />
          <LoadingBlock className="h-8 w-32 rounded-xl" />
          <LoadingBlock className="h-8 w-24 rounded-xl" />
        </div>
      );
    default:
      return null;
  }
}

const nameColumn = buildMemberNameColumn<RowData>();

function seatAwuCredits(
  seatType: MembershipSeatType | null,
  seatPlans: SeatPlanResponseBody
): number {
  if (!seatType || seatType === "none") {
    return -1;
  }
  return seatPlans[seatType]?.awuCredits ?? 0;
}

function canUpgrade(
  currentSeatType: MembershipSeatType | null,
  seatPlans: SeatPlanResponseBody
): boolean {
  const currentCredits = seatAwuCredits(currentSeatType, seatPlans);
  return Object.values(seatPlans).some(
    (info) => (info?.awuCredits ?? 0) > currentCredits
  );
}

const reasonColumn: ColumnDef<RowData, string> = {
  id: "reason" as const,
  header: "",
  enableSorting: false,
  cell: (info: Info) => {
    const { reason } = info.row.original.request;
    return (
      <DataTable.CellContent>
        <span
          className="line-clamp-2 text-sm text-muted-foreground"
          title={reason ?? undefined}
        >
          {reason || <Trans>Reached credit limit</Trans>}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "max-w-64",
  },
};

const requestedColumn: ColumnDef<RowData, string> = {
  id: "requested" as const,
  header: "",
  accessorFn: (row) => row.createdAt.toString(),
  cell: (info: Info) => (
    <DataTable.CellContent>
      <span className="text-sm text-muted-foreground">
        {timeAgoFrom(info.row.original.createdAt, { useLongFormat: true })}
      </span>
    </DataTable.CellContent>
  ),
  meta: {
    className: "w-32",
  },
};

function buildActionsColumn({
  seatPlans,
  onUpgradePlan,
  onEditLimit,
  onEditGroupBudget,
  onDeny,
  labels,
}: {
  seatPlans?: SeatPlanResponseBody;
  onUpgradePlan?: (request: MembershipUpgradeRequestType) => void;
  onEditLimit: (request: MembershipUpgradeRequestType) => void;
  onEditGroupBudget?: (request: MembershipUpgradeRequestType) => void;
  onDeny: (request: MembershipUpgradeRequestType) => void;
  labels: {
    deny: string;
    upgradePlan: string;
    assignSeat: string;
    editLimit: string;
    editGroupBudget: string;
  };
}): ColumnDef<RowData, string> {
  return {
    id: "actions" as const,
    header: "",
    enableSorting: false,
    accessorKey: "actions",
    cell: (info: Info) => {
      const { request, isPending } = info.row.original;
      if (isPending) {
        return (
          <div className="flex w-full justify-end pr-2">
            <Spinner size="xs" />
          </div>
        );
      }

      const denyButton = (
        <Button
          size="sm"
          variant="warning-secondary"
          icon={XClose}
          label={labels.deny}
          onClick={() => onDeny(request)}
        />
      );

      // Hide seat actions when there is no higher seat tier to move the
      // requester to: their current seat already grants as many AWU credits as
      // the richest seat the plan offers.
      const canUpgradePlan =
        !!seatPlans &&
        !!onUpgradePlan &&
        canUpgrade(request.requester.seatType, seatPlans);

      let primaryActions: ReactNode = null;
      switch (request.cause) {
        case "personal_limit":
          primaryActions = (
            <>
              {canUpgradePlan && (
                <Button
                  size="sm"
                  variant="highlight-secondary"
                  icon={Check}
                  label={labels.upgradePlan}
                  onClick={() => onUpgradePlan?.(request)}
                />
              )}
              <Button
                size="sm"
                variant="outline"
                label={labels.editLimit}
                onClick={() => onEditLimit(request)}
              />
            </>
          );
          break;
        case "no_seat":
          primaryActions = canUpgradePlan ? (
            <Button
              size="sm"
              variant="highlight-secondary"
              icon={Check}
              label={labels.assignSeat}
              onClick={() => onUpgradePlan?.(request)}
            />
          ) : null;
          break;
        case "group_shared_limit":
          primaryActions = onEditGroupBudget ? (
            <Button
              size="sm"
              variant="outline"
              label={labels.editGroupBudget}
              onClick={() => onEditGroupBudget(request)}
            />
          ) : null;
          break;
        default:
          assertNeverAndIgnore(request.cause);
          break;
      }

      return (
        <div className="flex w-full items-center justify-end gap-2">
          {denyButton}
          {primaryActions}
        </div>
      );
    },
    meta: {
      className: "w-96",
    },
  };
}

interface UpgradeRequestsTableProps {
  requests: MembershipUpgradeRequestType[];
  isLoading: boolean;
  seatPlans?: SeatPlanResponseBody;
  pendingRequestIds: ReadonlySet<string>;
  onUpgradePlan?: (request: MembershipUpgradeRequestType) => void;
  onEditLimit: (request: MembershipUpgradeRequestType) => void;
  onEditGroupBudget?: (request: MembershipUpgradeRequestType) => void;
  onDeny: (request: MembershipUpgradeRequestType) => void;
}

export function UpgradeRequestsTable({
  requests,
  isLoading,
  seatPlans,
  pendingRequestIds,
  onUpgradePlan,
  onEditLimit,
  onEditGroupBudget,
  onDeny,
}: UpgradeRequestsTableProps) {
  const { t } = useLingui();
  const rows: RowData[] = useMemo(
    () =>
      requests.map((request) => ({
        sId: request.sId,
        name: request.requester.name,
        email: request.requester.email,
        image: request.requester.image,
        createdAt: request.createdAt,
        request,
        isPending: pendingRequestIds.has(request.sId),
      })),
    [requests, pendingRequestIds]
  );

  const columns = useMemo(
    () => [
      nameColumn,
      reasonColumn,
      requestedColumn,
      buildActionsColumn({
        seatPlans,
        onUpgradePlan,
        onEditLimit,
        onEditGroupBudget,
        onDeny,
        labels: {
          deny: t`Deny`,
          upgradePlan: t`Upgrade plan`,
          assignSeat: t`Assign seat`,
          editLimit: t`Edit limit`,
          editGroupBudget: t`Edit group budget`,
        },
      }),
    ],
    [seatPlans, onUpgradePlan, onEditLimit, onEditGroupBudget, onDeny, t]
  );

  if (isLoading) {
    return (
      <DataTableSkeleton
        columns={columns}
        SkeletonCell={UpgradeRequestSkeletonCell}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex w-full justify-center py-8">
        <span className="text-sm text-muted-foreground">
          <Trans>No pending upgrade requests.</Trans>
        </span>
      </div>
    );
  }

  return <DataTable<RowData> data={rows} columns={columns} />;
}
