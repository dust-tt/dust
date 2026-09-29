import { EditMemberSpendLimitModal } from "@app/components/workspace/EditMemberSpendLimitModal";
import type { DefaultUserSpendLimitState } from "@app/components/workspace/WorkspaceDefaultLimitInput";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useMembersUsage } from "@app/lib/swr/memberships";
import { useDefaultUserSpendLimit } from "@app/lib/swr/usage_settings";
import type { GroupType } from "@app/types/groups";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin, isManager } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";

interface UpgradeRequestLimitModalProps {
  owner: WorkspaceType;
  request: MembershipUpgradeRequestType;
  groups: GroupType[];
  editableGroupIds?: ReadonlySet<string>;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * @cc [owner:philipperolet,label:product] request-limit-save-order
 * The editor MUST load current limits for the exact requester before enabling edits.
 * `onSaved` MUST run only after a limit change succeeds, never on cancellation or a failed save.
 */
/**
 * @cc [owner:philipperolet,label:security;react] request-limit-permissions
 * Delegates MUST NOT fetch workspace default settings or edit groups outside `editableGroupIds`.
 * Only workspace admins may edit the workspace default.
 */
export function UpgradeRequestLimitModal({
  owner,
  request,
  groups,
  editableGroupIds,
  onClose,
  onSaved,
  onSavingChange,
}: UpgradeRequestLimitModalProps) {
  const { subscription } = useAuth();
  const canReadDefaultLimit =
    isManager(owner) && isSubscriptionMetronomeBilled(subscription);
  const { defaultUserSpendLimit, isDefaultUserSpendLimitError } =
    useDefaultUserSpendLimit({
      workspaceId: owner.sId,
      disabled: !canReadDefaultLimit,
    });
  const { membersUsage, isMembersUsageLoading, isMembersUsageError } =
    useMembersUsage({
      workspaceId: owner.sId,
      searchTerm: request.requester.email ?? request.requester.name,
      pageIndex: 0,
      pageSize: 25,
    });
  const member = membersUsage.find(
    (member) => member.sId === request.requester.sId
  );

  // Delegates can see the inherited default in member usage but cannot read workspace settings.
  const inheritedDefault: DefaultUserSpendLimitState =
    member?.spendLimitSource === "default" &&
    member.spendLimitAwuCredits !== null
      ? {
          status: "ready",
          awuCredits: Math.max(
            0,
            member.spendLimitAwuCredits - (member.memberUsageLimit ?? 0)
          ),
        }
      : { status: "unavailable" };
  const defaultLimitState: DefaultUserSpendLimitState = canReadDefaultLimit
    ? defaultUserSpendLimit
      ? { status: "ready", awuCredits: defaultUserSpendLimit.awuCredits }
      : isDefaultUserSpendLimitError
        ? { status: "error" }
        : { status: "loading" }
    : isManager(owner)
      ? { status: "unavailable" }
      : inheritedDefault;

  // Never initialize the editor with fabricated limits when the member cannot be loaded.
  if (isMembersUsageLoading || isMembersUsageError || !member) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Edit spend limit for {request.requester.name}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {isMembersUsageLoading ? (
              <Spinner />
            ) : (
              "Could not load this member's current limits. Refresh the page to try again."
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: onClose,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <EditMemberSpendLimitModal
      isOpen
      member={member}
      owner={owner}
      groups={groups}
      editableGroupIds={editableGroupIds}
      readOnly={!isManager(owner) && !editableGroupIds?.size}
      canEditDefaultLimit={isAdmin(owner)}
      defaultUserSpendLimit={defaultLimitState}
      onSavingChange={onSavingChange}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
