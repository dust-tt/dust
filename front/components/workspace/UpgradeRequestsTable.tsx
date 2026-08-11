import { ManageUpgradeRequestModal } from "@app/components/workspace/ManageUpgradeRequestModal";
import { buildMemberNameColumn } from "@app/components/workspace/member_name_column";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  MembershipSeatType,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import {
  AlertCircle,
  Button,
  ContentMessage,
  DataTable,
  LoadingBlock,
  Spinner,
  X,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

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
  cell: (info: Info) => {
    const { reason } = info.row.original.request;
    return (
      <DataTable.CellContent>
        <span
          className="line-clamp-2 text-sm text-muted-foreground"
          title={reason ?? undefined}
        >
          {reason || REASON_LABEL}
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
        {timeAgoFrom(info.row.original.createdAt, { useLongFormat: true })} ago
      </span>
    </DataTable.CellContent>
  ),
  meta: {
    className: "w-32",
  },
};

function buildActionsColumn({
  onManage,
  onDeny,
}: {
  onManage: (request: MembershipUpgradeRequestType) => void;
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
      return (
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            size="sm"
            variant="warning-secondary"
            icon={X}
            label="Deny"
            onClick={() => onDeny(request)}
          />
          <Button
            size="sm"
            variant="outline"
            label="Manage"
            onClick={() => onManage(request)}
          />
        </div>
      );
    },
    meta: {
      className: "w-48",
    },
  };
}

interface UpgradeRequestsTableProps {
  requests: MembershipUpgradeRequestType[];
  isLoading: boolean;
  isError: boolean;
  totalRowCount: number;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  seatPlans: SeatPlanResponseBody;
  isEnterprise: boolean;
  pendingRequestIds: ReadonlySet<string>;
  onUpgradePlan: (request: MembershipUpgradeRequestType) => void;
  onSetCreditAmount: (request: MembershipUpgradeRequestType) => void;
  onDeny: (request: MembershipUpgradeRequestType) => void;
}

export function UpgradeRequestsTable({
  requests,
  isLoading,
  isError,
  totalRowCount,
  pagination,
  setPagination,
  seatPlans,
  isEnterprise,
  pendingRequestIds,
  onUpgradePlan,
  onSetCreditAmount,
  onDeny,
}: UpgradeRequestsTableProps) {
  const [manageRequest, setManageRequest] =
    useState<MembershipUpgradeRequestType | null>(null);

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
        onManage: setManageRequest,
        onDeny,
      }),
    ],
    [onDeny]
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

  if (isError) {
    return (
      <ContentMessage
        title="Failed to load upgrade requests"
        icon={AlertCircle}
        variant="warning"
      >
        An error occurred while loading pending upgrade requests. Please refresh
        the page or contact support if the issue persists.
      </ContentMessage>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex w-full justify-center py-8">
        <span className="text-sm text-muted-foreground">
          No pending upgrade requests.
        </span>
      </div>
    );
  }

  // Hide "Upgrade User Plan" for enterprise workspaces
  // and whenever there is no higher seat tier to move the requester to
  const canUpgradePlan =
    !isEnterprise &&
    canUpgrade(manageRequest?.requester.seatType ?? null, seatPlans);

  return (
    <>
      <DataTable<RowData>
        data={rows}
        columns={columns}
        pagination={pagination}
        setPagination={setPagination}
        totalRowCount={totalRowCount}
      />
      <ManageUpgradeRequestModal
        request={manageRequest}
        onClose={() => setManageRequest(null)}
        canUpgradePlan={canUpgradePlan}
        onUpgradePlan={onUpgradePlan}
        onSetCreditAmount={onSetCreditAmount}
      />
    </>
  );
}
