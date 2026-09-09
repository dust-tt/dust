import { CreditLimitInput } from "@app/components/workspace/CreditLimitInput";
import { MemberGroupLimitTable } from "@app/components/workspace/MemberGroupLimitTable";
import {
  groupRowsForMember,
  parseCreditsInput,
  toSpendLimit,
} from "@app/components/workspace/member_spend_limit_helpers";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
import { useUpdateGroupSpendLimit } from "@app/lib/swr/groups";
import { useUpdateUserSpendLimit } from "@app/lib/swr/memberships";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

// TODO(spend-limit-modal-rollout): remove `EditSpendLimitModal` and
// `BulkEditSpendLimitModal` once the usage page has fully rolled onto this
// component, so there's a single spend-limit editing implementation again.
interface EditMemberSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Called only once a change has actually been persisted, distinct from
  // `onClose` which also fires on cancel or a read-only dismiss.
  onSaved?: () => void;
  member: MemberUsageType | null;
  owner: LightWorkspaceType;
  groups: GroupType[];
  readOnly?: boolean;
}

interface MemberSpendLimitFormProps {
  member: MemberUsageType | null;
  owner: LightWorkspaceType;
  groups: GroupType[];
  readOnly: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

function MemberSpendLimitForm({
  member,
  owner,
  groups,
  readOnly,
  onClose,
  onSaved,
}: MemberSpendLimitFormProps) {
  const { doUpdateSpendLimit } = useUpdateUserSpendLimit({
    workspaceId: owner.sId,
  });
  const { doUpdateGroupSpendLimit } = useUpdateGroupSpendLimit({
    workspaceId: owner.sId,
  });

  const seatAllowanceAwuCredits = member?.memberUsageLimit ?? 0;
  const effectiveLimitAwuCredits = member?.spendLimitAwuCredits ?? 0;
  const extraAwuCredits = Math.max(
    0,
    effectiveLimitAwuCredits - seatAllowanceAwuCredits
  );
  const hasPersonalOverride = member?.spendLimitSource === "override";
  const initialPersonalOverride = hasPersonalOverride ? extraAwuCredits : null;

  const memberGroupRows = useMemo(
    () => groupRowsForMember(member, groups),
    [member, groups]
  );

  const [personalLimitInput, setPersonalLimitInput] = useState<string>(() =>
    hasPersonalOverride ? String(extraAwuCredits) : ""
  );
  const [groupLimitInputs, setGroupLimitInputs] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      memberGroupRows.map((row) => [
        row.groupId,
        row.poolCapAwuCredits === null ? "" : String(row.poolCapAwuCredits),
      ])
    )
  );
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );
  const [groupValidationMessages, setGroupValidationMessages] = useState<
    Record<string, string | null>
  >({});

  function handleGroupLimitChange(groupId: string, cleaned: string) {
    setGroupLimitInputs((prev) => ({
      ...prev,
      [groupId]: cleaned,
    }));
    setGroupValidationMessages((prev) => ({
      ...prev,
      [groupId]: null,
    }));
  }

  async function handleValidate() {
    if (!member) {
      return;
    }

    const personalResult = parseCreditsInput(personalLimitInput);
    setValidationMessage(personalResult.ok ? null : personalResult.message);

    const groupResults = memberGroupRows.map((row) => ({
      row,
      result: parseCreditsInput(groupLimitInputs[row.groupId] ?? ""),
    }));
    setGroupValidationMessages(
      Object.fromEntries(
        groupResults.map(({ row, result }) => [
          row.groupId,
          result.ok ? null : result.message,
        ])
      )
    );

    if (!personalResult.ok || groupResults.some(({ result }) => !result.ok)) {
      return;
    }

    const personalChanged =
      personalResult.awuCredits !== initialPersonalOverride;
    const groupChanges = groupResults.flatMap(({ row, result }) =>
      result.ok && result.awuCredits !== row.poolCapAwuCredits
        ? [{ row, awuCredits: result.awuCredits }]
        : []
    );

    if (!personalChanged && groupChanges.length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const tasks: Array<() => Promise<unknown>> = [];
      if (personalChanged) {
        const limit = toSpendLimit(personalResult.awuCredits);
        tasks.push(() =>
          doUpdateSpendLimit({
            memberId: member.sId,
            memberName: member.name,
            limit,
          })
        );
      }
      for (const { row, awuCredits } of groupChanges) {
        const limit = toSpendLimit(awuCredits);
        tasks.push(() =>
          doUpdateGroupSpendLimit({
            groupId: row.groupId,
            groupName: row.name,
            limit,
          })
        );
      }

      const results = await concurrentExecutor(tasks, (task) => task(), {
        concurrency: 8,
      });
      if (results.every((result) => result !== null)) {
        onSaved?.();
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex flex-col gap-2">
          <Avatar
            visual={member?.image ?? undefined}
            name={member?.name}
            size="md"
            isRounded
          />
          <div>
            <DialogTitle>Edit spend limit for {member?.name}</DialogTitle>
            <DialogDescription>
              This user can currently consume{" "}
              {formatCredits(seatAllowanceAwuCredits)} credits from their seat,
              plus {formatCredits(extraAwuCredits)} on the&nbsp;pool.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-5">
          <CreditLimitInput
            label="Personal limit"
            value={personalLimitInput}
            readOnly={readOnly}
            isHighest={hasPersonalOverride}
            validationMessage={validationMessage}
            onChange={(cleaned) => {
              setPersonalLimitInput(cleaned);
              setValidationMessage(null);
            }}
          />

          {memberGroupRows.length > 0 && (
            <Page.Vertical gap="xs" align="stretch">
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                Group limits
              </span>
              <MemberGroupLimitTable
                rows={memberGroupRows}
                readOnly={readOnly}
                groupLimitInputs={groupLimitInputs}
                groupValidationMessages={groupValidationMessages}
                onChange={handleGroupLimitChange}
              />
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
          disabled: isSaving || readOnly,
          isLoading: isSaving,
          onClick: handleValidate,
        }}
      />
    </>
  );
}

export function EditMemberSpendLimitModal({
  isOpen,
  onClose,
  onSaved,
  member,
  owner,
  groups,
  readOnly = false,
}: EditMemberSpendLimitModalProps) {
  const lastMemberRef = useRef<MemberUsageType | null>(null);
  useEffect(() => {
    if (member) {
      lastMemberRef.current = member;
    }
  }, [member]);
  const displayedMember = member ?? lastMemberRef.current;

  const memberGroupsResolved = (displayedMember?.groups ?? []).every(
    (groupName) => groups.some((g) => g.name === groupName)
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="font-sans">
        <MemberSpendLimitForm
          // Remounts with fresh draft state on every open, whenever the
          // targeted member changes, or once the member's groups resolve,
          // instead of syncing state from props.
          key={`${displayedMember?.sId ?? "none"}:${isOpen}:${memberGroupsResolved}`}
          member={displayedMember}
          owner={owner}
          groups={groups}
          readOnly={readOnly}
          onClose={onClose}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
