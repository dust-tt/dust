import { ConfirmContext } from "@app/components/Confirm";
import { ChangeSeatModal } from "@app/components/workspace/ChangeSeatModal";
import { EditMemberSpendLimitModal } from "@app/components/workspace/EditMemberSpendLimitModal";
import { UpgradeRequestsTable } from "@app/components/workspace/UpgradeRequestsTable";
import type { DefaultUserSpendLimitState } from "@app/components/workspace/WorkspaceDefaultLimitInput";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useMembersUsage } from "@app/lib/swr/memberships";
import { useResolveUpgradeRequest } from "@app/lib/swr/upgrade_requests";
import { useDefaultUserSpendLimit } from "@app/lib/swr/usage_settings";
import type { GroupType } from "@app/types/groups";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin, isManager } from "@app/types/user";
import {
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";

interface UpgradeRequestsProps {
  owner: WorkspaceType;
  requests: MembershipUpgradeRequestType[];
  isLoading: boolean;
  groups: GroupType[];
  seatUpgrade: {
    plans: SeatPlanResponseBody;
    isLoading: boolean;
    isError: boolean;
    isManagedByGroup: (member: MemberUsageType | null) => boolean;
    onSavingChange: (memberId: string, isSaving: boolean) => void;
  };
  onSpendLimitSavingChange: (memberId: string, isSaving: boolean) => void;
  onSaved: () => void;
}

// Build a minimal member from an upgrade request to feed the reused seat / spend
// limit modals.
function memberFromUpgradeRequest(
  request: MembershipUpgradeRequestType
): MemberUsageType {
  return {
    sId: request.requester.sId,
    name: request.requester.name,
    email: request.requester.email,
    image: request.requester.image,
    groups: [],
    seatType: request.requester.seatType,
    memberUsageLimit: null,
    seatBalanceAwu: null,
    consumedAwuCredits: 0,
    consumedFromAllowanceAwuCredits: 0,
    consumedFromPoolAwuCredits: 0,
    billingFrequency: null,
    nextCreditResetAt: null,
    scheduledSeatType: null,
    scheduledSeatChangeAt: null,
    spendLimitAwuCredits: null,
    poolCapOverrideExpiresAt: null,
    poolCapOverridePreviousAwuCredits: null,
    rateLimiterSpendAwuCredits: null,
    metronomeConsumedAwuCredits: null,
    spendLimitSource: "none",
    spendLimitGroupName: null,
    spendLimitAlertId: null,
    spendLimitWarningAlertId: null,
    creditState: "on_pool",
    rateLimiterState: null,
    // Synthesized from a capped user's upgrade request.
    isSpendCapped: true,
    seatUsageTarget: null,
    overallUsageTarget: null,
  };
}

/**
 * @cc [owner:philipperolet,label:product] request-approval-after-save
 * A request MUST be approved only after its seat or limit editor reports a successful save.
 * Cancelling an editor MUST leave the request pending.
 */
export function UpgradeRequests({
  owner,
  requests,
  isLoading,
  groups,
  seatUpgrade,
  onSpendLimitSavingChange,
  onSaved,
}: UpgradeRequestsProps) {
  const { subscription } = useAuth();
  const confirm = useContext(ConfirmContext);
  const [changeSeatMember, setChangeSeatMember] =
    useState<MemberUsageType | null>(null);
  const [spendLimitRecapMember, setSpendLimitRecapMember] =
    useState<MemberUsageType | null>(null);
  const hasMetronomeContract = isSubscriptionMetronomeBilled(subscription);
  const { defaultUserSpendLimit, isDefaultUserSpendLimitError } =
    useDefaultUserSpendLimit({
      workspaceId: owner.sId,
      disabled: spendLimitRecapMember === null || !hasMetronomeContract,
    });
  // Same availability rule as the workspace read endpoint and poke's
  // PoolUsagePage: the default pool limit only exists for Metronome-billed
  // workspaces.
  const defaultUserSpendLimitState: DefaultUserSpendLimitState =
    !hasMetronomeContract
      ? { status: "unavailable" }
      : defaultUserSpendLimit
        ? { status: "ready", awuCredits: defaultUserSpendLimit.awuCredits }
        : isDefaultUserSpendLimitError
          ? { status: "error" }
          : { status: "loading" };
  const { doResolveUpgradeRequest } = useResolveUpgradeRequest({
    workspaceId: owner.sId,
  });
  const [resolvingRequestIds, setResolvingRequestIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const setRequestResolving = useCallback(
    (requestId: string, isResolving: boolean) =>
      setResolvingRequestIds((prev) => {
        const next = new Set(prev);
        next[isResolving ? "add" : "delete"](requestId);
        return next;
      }),
    []
  );
  // The request to approve once its seat or spend-limit modal saves.
  const [pendingApproveRequestId, setPendingApproveRequestId] = useState<
    string | null
  >(null);
  const handleUpgradePlanRequest = useCallback(
    (request: MembershipUpgradeRequestType) => {
      setPendingApproveRequestId(request.sId);
      setChangeSeatMember(memberFromUpgradeRequest(request));
    },
    []
  );

  const [pendingEditLimit, dispatchPendingEditLimit] = useReducer(
    (
      _state: MembershipUpgradeRequestType | null,
      action:
        | { type: "start"; request: MembershipUpgradeRequestType }
        | { type: "settled" }
    ) => (action.type === "start" ? action.request : null),
    null
  );
  const {
    membersUsage: pendingEditLimitMembersUsage,
    isMembersUsageLoading: isPendingEditLimitMemberLoading,
  } = useMembersUsage({
    workspaceId: owner.sId,
    searchTerm: pendingEditLimit?.requester.email ?? "",
    pageIndex: 0,
    pageSize: 1,
    disabled: !pendingEditLimit,
  });
  useEffect(() => {
    if (!pendingEditLimit || isPendingEditLimitMemberLoading) {
      return;
    }
    const request = pendingEditLimit;
    const fetchedMember = pendingEditLimitMembersUsage.find(
      (m) => m.sId === request.requester.sId
    );
    setPendingApproveRequestId(request.sId);
    setSpendLimitRecapMember(
      fetchedMember ?? memberFromUpgradeRequest(request)
    );
    setRequestResolving(request.sId, false);
    dispatchPendingEditLimit({ type: "settled" });
  }, [
    pendingEditLimit,
    isPendingEditLimitMemberLoading,
    pendingEditLimitMembersUsage,
    setRequestResolving,
  ]);
  const handleEditLimitRequest = useCallback(
    (request: MembershipUpgradeRequestType) => {
      setRequestResolving(request.sId, true);
      dispatchPendingEditLimit({ type: "start", request });
    },
    [setRequestResolving]
  );
  const handleApproveOnModalSaved = useCallback(() => {
    if (!pendingApproveRequestId) {
      return;
    }
    const requestId = pendingApproveRequestId;
    const request = requests.find((r) => r.sId === requestId);
    setRequestResolving(requestId, true);
    void doResolveUpgradeRequest({
      requestId,
      requesterName: request?.requester.name ?? "Member",
      status: "approved",
    }).finally(() => setRequestResolving(requestId, false));
  }, [
    pendingApproveRequestId,
    requests,
    doResolveUpgradeRequest,
    setRequestResolving,
  ]);
  const handleDenyRequest = useCallback(
    async (request: MembershipUpgradeRequestType) => {
      const confirmed = await confirm({
        title: "Deny upgrade request",
        message: `Deny ${request.requester.name}'s request to increase their spend limit?`,
        validateLabel: "Deny",
        validateVariant: "warning",
      });
      if (!confirmed) {
        return;
      }
      setRequestResolving(request.sId, true);
      try {
        await doResolveUpgradeRequest({
          requestId: request.sId,
          requesterName: request.requester.name,
          status: "denied",
        });
      } finally {
        setRequestResolving(request.sId, false);
      }
    },
    [confirm, doResolveUpgradeRequest, setRequestResolving]
  );

  function handleSaved() {
    onSaved();
    handleApproveOnModalSaved();
  }

  return (
    <>
      <UpgradeRequestsTable
        requests={requests}
        isLoading={isLoading}
        seatPlans={seatUpgrade.plans}
        pendingRequestIds={resolvingRequestIds}
        onUpgradePlan={handleUpgradePlanRequest}
        onEditLimit={handleEditLimitRequest}
        onDeny={handleDenyRequest}
      />
      <ChangeSeatModal
        isOpen={changeSeatMember !== null}
        onClose={() => {
          setChangeSeatMember(null);
          setPendingApproveRequestId(null);
        }}
        member={changeSeatMember}
        owner={owner}
        seatPlans={seatUpgrade.plans}
        isSeatPlanLoading={seatUpgrade.isLoading}
        isSeatPlanError={seatUpgrade.isError}
        onSavingChange={seatUpgrade.onSavingChange}
        onSaved={handleSaved}
        seatManagedByGroup={seatUpgrade.isManagedByGroup(changeSeatMember)}
      />
      <EditMemberSpendLimitModal
        isOpen={spendLimitRecapMember !== null}
        onClose={() => {
          setSpendLimitRecapMember(null);
          setPendingApproveRequestId(null);
        }}
        member={spendLimitRecapMember}
        owner={owner}
        groups={groups}
        readOnly={!isManager(owner)}
        canEditDefaultLimit={isAdmin(owner)}
        defaultUserSpendLimit={defaultUserSpendLimitState}
        onSavingChange={onSpendLimitSavingChange}
        onSaved={handleSaved}
      />
    </>
  );
}
