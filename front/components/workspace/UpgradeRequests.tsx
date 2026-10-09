import { ConfirmContext } from "@app/components/Confirm";
import { ChangeSeatModal } from "@app/components/workspace/ChangeSeatModal";
import { UpgradeRequestGroupBudgetModal } from "@app/components/workspace/UpgradeRequestGroupBudgetModal";
import { UpgradeRequestLimitModal } from "@app/components/workspace/UpgradeRequestLimitModal";
import { UpgradeRequestsTable } from "@app/components/workspace/UpgradeRequestsTable";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { useResolveUpgradeRequest } from "@app/lib/swr/upgrade_requests";
import type { GroupType } from "@app/types/groups";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import { ContentMessage } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useContext, useMemo, useState } from "react";

interface UpgradeRequestsProps {
  owner: WorkspaceType;
  requests: MembershipUpgradeRequestType[];
  isLoading: boolean;
  isError?: boolean;
  groups: GroupType[];
  editableGroupIds?: ReadonlySet<string>;
  seatUpgrade?: {
    plans: SeatPlanResponseBody;
    isLoading: boolean;
    isError: boolean;
    isManagedByGroup: (member: MemberUsageType | null) => boolean;
    onSavingChange: (memberId: string, isSaving: boolean) => void;
  };
  onSpendLimitSavingChange?: (memberId: string, isSaving: boolean) => void;
  onSaved?: () => void;
}

// Build a minimal member from an upgrade request for the seat editor.
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
  isError,
  groups,
  editableGroupIds,
  seatUpgrade,
  onSpendLimitSavingChange,
  onSaved,
}: UpgradeRequestsProps) {
  const { t } = useLingui();
  const confirm = useContext(ConfirmContext);
  const [requestToEdit, setRequestToEdit] =
    useState<MembershipUpgradeRequestType | null>(null);
  const [requestToEditGroupBudget, setRequestToEditGroupBudget] =
    useState<MembershipUpgradeRequestType | null>(null);
  const [requestToUpgrade, setRequestToUpgrade] =
    useState<MembershipUpgradeRequestType | null>(null);
  const changeSeatMember = useMemo(
    () =>
      requestToUpgrade ? memberFromUpgradeRequest(requestToUpgrade) : null,
    [requestToUpgrade]
  );
  const [resolvingRequestIds, setResolvingRequestIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const { doResolveUpgradeRequest } = useResolveUpgradeRequest({
    workspaceId: owner.sId,
  });

  async function resolveRequest(
    request: MembershipUpgradeRequestType,
    status: "approved" | "denied"
  ) {
    const requesterName = request.requester.name;
    if (
      status === "denied" &&
      !(await confirm({
        title: t`Deny upgrade request`,
        message: t`Deny ${requesterName}'s request to increase their spend limit?`,
        validateLabel: t`Deny`,
        validateVariant: "warning",
        cancelLabel: t`Cancel`,
      }))
    ) {
      return;
    }
    setResolvingRequestIds((current) => new Set([...current, request.sId]));
    try {
      await doResolveUpgradeRequest({
        requestId: request.sId,
        requesterName: request.requester.name,
        status,
      });
    } finally {
      setResolvingRequestIds(
        (current) => new Set([...current].filter((id) => id !== request.sId))
      );
    }
  }

  function handleSaved(request: MembershipUpgradeRequestType) {
    onSaved?.();
    void resolveRequest(request, "approved");
  }

  return (
    <>
      {isError ? (
        <ContentMessage variant="warning">
          <Trans>Could not load requests. Refresh the page to try again.</Trans>
        </ContentMessage>
      ) : (
        <UpgradeRequestsTable
          requests={requests}
          isLoading={isLoading}
          seatPlans={seatUpgrade?.plans}
          pendingRequestIds={resolvingRequestIds}
          onUpgradePlan={seatUpgrade ? setRequestToUpgrade : undefined}
          onEditLimit={setRequestToEdit}
          onEditGroupBudget={setRequestToEditGroupBudget}
          onDeny={(request) => void resolveRequest(request, "denied")}
        />
      )}
      {seatUpgrade && (
        <ChangeSeatModal
          isOpen={requestToUpgrade !== null}
          onClose={() => setRequestToUpgrade(null)}
          member={changeSeatMember}
          owner={owner}
          seatPlans={seatUpgrade.plans}
          isSeatPlanLoading={seatUpgrade.isLoading}
          isSeatPlanError={seatUpgrade.isError}
          onSavingChange={seatUpgrade.onSavingChange}
          onSaved={() => {
            if (requestToUpgrade) {
              handleSaved(requestToUpgrade);
            }
          }}
          seatManagedByGroup={seatUpgrade.isManagedByGroup(changeSeatMember)}
        />
      )}
      {requestToEdit && (
        <UpgradeRequestLimitModal
          key={requestToEdit.sId}
          owner={owner}
          request={requestToEdit}
          groups={groups}
          editableGroupIds={editableGroupIds}
          onClose={() => setRequestToEdit(null)}
          onSavingChange={onSpendLimitSavingChange}
          onSaved={() => handleSaved(requestToEdit)}
        />
      )}
      {requestToEditGroupBudget && (
        <UpgradeRequestGroupBudgetModal
          key={requestToEditGroupBudget.sId}
          owner={owner}
          request={requestToEditGroupBudget}
          groups={groups}
          editableGroupIds={editableGroupIds}
          onClose={() => setRequestToEditGroupBudget(null)}
          onSaved={() => handleSaved(requestToEditGroupBudget)}
        />
      )}
    </>
  );
}
