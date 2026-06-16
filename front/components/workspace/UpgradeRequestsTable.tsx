import { buildMemberNameColumn } from "@app/components/workspace/member_name_column";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import {
  Button,
  Check,
  DataTable,
  LoadingBlock,
  Spinner,
  X,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

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

const nameColumn = buildMemberNameColumn<RowData>();

const REASON_LABEL = "Reached credit limit";

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
  cell: () => (
    <DataTable.CellContent>
      <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {REASON_LABEL}
      </span>
    </DataTable.CellContent>
  ),
};

const requestedColumn: ColumnDef<RowData, string> = {
  id: "requested" as const,
  header: "",
  accessorFn: (row) => row.createdAt.toString(),
  cell: (info: Info) => (
    <DataTable.CellContent>
      <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        {timeAgoFrom(info.row.original.createdAt, { useLongFormat: true })} ago
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
  onDeny,
}: {
  seatPlans: SeatPlanResponseBody;
  onUpgradePlan: (request: MembershipUpgradeRequestType) => void;
  onEditLimit: (request: MembershipUpgradeRequestType) => void;
  onDeny: (request: MembershipUpgradeRequestType) => void;
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
      // Hide "Upgrade plan" when there is no higher seat tier to move the
      // requester to: their current seat already grants as many AWU credits as
      // the richest seat the plan offers.
      const canUpgradePlan = canUpgrade(request.requester.seatType, seatPlans);
      return (
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            size="sm"
            variant="warning-secondary"
            icon={X}
            label="Deny"
            onClick={() => onDeny(request)}
          />
          {canUpgradePlan && (
            <Button
              size="sm"
              variant="highlight-secondary"
              icon={Check}
              label="Upgrade plan"
              onClick={() => onUpgradePlan(request)}
            />
          )}
          <Button
            size="sm"
            variant="outline"
            label="Edit limit"
            onClick={() => onEditLimit(request)}
          />
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
  seatPlans: SeatPlanResponseBody;
  pendingRequestIds: ReadonlySet<string>;
  onUpgradePlan: (request: MembershipUpgradeRequestType) => void;
  onEditLimit: (request: MembershipUpgradeRequestType) => void;
  onDeny: (request: MembershipUpgradeRequestType) => void;
}

export function UpgradeRequestsTable({
  requests,
  isLoading,
  seatPlans,
  pendingRequestIds,
  onUpgradePlan,
  onEditLimit,
  onDeny,
}: UpgradeRequestsTableProps) {
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
        onDeny,
      }),
    ],
    [seatPlans, onUpgradePlan, onEditLimit, onDeny]
  );

  if (isLoading) {
    return (
      <div className="flex w-full flex-col space-y-2">
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex w-full justify-center py-8">
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No pending upgrade requests.
        </span>
      </div>
    );
  }

  return <DataTable<RowData> data={rows} columns={columns} />;
}
