import { PersonalLimitInput } from "@app/components/workspace/CreditLimitInput";
import {
  groupRowsForMember,
  parseCreditsInput,
  toSpendLimit,
} from "@app/components/workspace/member_spend_limit_helpers";
import { MemberGroupLimitTable } from "@app/components/workspace/MemberGroupLimitTable";
import type { DefaultUserSpendLimitState } from "@app/components/workspace/WorkspaceDefaultLimitInput";
import {
  useWorkspaceDefaultLimitField,
  WorkspaceDefaultLimitInput,
} from "@app/components/workspace/WorkspaceDefaultLimitInput";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits, roundCredits } from "@app/lib/client/credits";
import { useUpdateGroupSpendLimit } from "@app/lib/swr/groups";
import { useUpdateUserSpendLimit } from "@app/lib/swr/memberships";
import { useUpdateDefaultUserSpendLimit } from "@app/lib/swr/usage_settings";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { GroupType } from "@app/types/groups";
import {
  isMembershipSeatType,
  normalizeToPoolLimitSeatType,
} from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Page,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";

interface EditMemberSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: LightWorkspaceType;
  groups: GroupType[];
  editableGroupIds?: ReadonlySet<string>;
  readOnly?: boolean;
  // The workspace default applies to every member, so editing it is reserved
  // to admins even where managers may edit personal and group limits.
  canEditDefaultLimit?: boolean;
  defaultUserSpendLimit: DefaultUserSpendLimitState;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
  // Fired once the limits have been persisted successfully (not on cancel or
  // a load error). Used to resolve a linked upgrade request as approved.
  onSaved?: () => void;
}

interface MemberSpendLimitFormProps {
  member: MemberUsageType | null;
  owner: LightWorkspaceType;
  groups: GroupType[];
  editableGroupIds?: ReadonlySet<string>;
  readOnly: boolean;
  canEditDefaultLimit: boolean;
  defaultUserSpendLimit: DefaultUserSpendLimitState;
  onClose: () => void;
  onSavingChange?: (memberId: string, isSaving: boolean) => void;
  onSaved?: () => void;
}

function MemberSpendLimitForm({
  member,
  owner,
  groups,
  editableGroupIds,
  readOnly,
  canEditDefaultLimit,
  defaultUserSpendLimit,
  onClose,
  onSavingChange,
  onSaved,
}: MemberSpendLimitFormProps) {
  const { t } = useLingui();
  const { doUpdateSpendLimit } = useUpdateUserSpendLimit({
    workspaceId: owner.sId,
  });
  const { doUpdateGroupSpendLimit } = useUpdateGroupSpendLimit({
    workspaceId: owner.sId,
  });
  const { doUpdateDefaultUserSpendLimit } = useUpdateDefaultUserSpendLimit({
    workspaceId: owner.sId,
  });
  // The "default" source also labels free and none seats, whose cap is the
  // seat allowance (or 0) rather than the workspace pool default. Only
  // pool-bearing seats are actually capped by the workspace default. The
  // server may have introduced a seat type the client hasn't refreshed to
  // know about yet, so unrecognized values are treated as non-pool rather
  // than passed to the exhaustive normalizer.
  const isDefaultActive =
    member?.spendLimitSource === "default" &&
    isMembershipSeatType(member.seatType) &&
    normalizeToPoolLimitSeatType(member.seatType) !== null;
  const showDefaultLimit =
    isDefaultActive && defaultUserSpendLimit.status !== "unavailable";
  const defaultLimitField = useWorkspaceDefaultLimitField({
    defaultUserSpendLimit,
    canEdit: showDefaultLimit && canEditDefaultLimit && !readOnly,
  });

  const seatAllowanceAwuCredits = member?.memberUsageLimit ?? 0;
  const effectiveLimitAwuCredits = member?.spendLimitAwuCredits ?? 0;
  const extraAwuCredits = Math.max(
    0,
    effectiveLimitAwuCredits - seatAllowanceAwuCredits
  );
  const hasPersonalOverride = member?.spendLimitSource === "override";
  const initialPersonalOverride = hasPersonalOverride ? extraAwuCredits : null;
  const initialResetAtNextBillingCycle =
    member?.poolCapOverrideExpiresAt !== null &&
    member?.poolCapOverrideExpiresAt !== undefined;
  // Baseline restored when the temporary raise expires: keep the original
  // snapshot if one is already in flight, otherwise the current override.
  const resetBaselineAwuCredits = initialResetAtNextBillingCycle
    ? (member?.poolCapOverridePreviousAwuCredits ?? null)
    : initialPersonalOverride;
  const resetBaselineCredits =
    resetBaselineAwuCredits === null
      ? null
      : formatCredits(resetBaselineAwuCredits);
  const resetBaselineCreditCount =
    resetBaselineAwuCredits === null
      ? null
      : roundCredits(resetBaselineAwuCredits);
  const memberName = member?.name;

  const memberGroupRows = useMemo(
    () => groupRowsForMember(member, groups),
    [member, groups]
  );

  const [personalLimitInput, setPersonalLimitInput] = useState<string>(() =>
    hasPersonalOverride ? String(extraAwuCredits) : ""
  );
  const [resetAtNextBillingCycle, setResetAtNextBillingCycle] = useState(
    initialResetAtNextBillingCycle
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

  async function handleValidate(event: React.MouseEvent) {
    event.preventDefault();
    if (!member || defaultLimitField.isPending) {
      return;
    }

    const personalResult = parseCreditsInput(personalLimitInput);
    setValidationMessage(personalResult.ok ? null : t(personalResult.message));

    const groupResults = memberGroupRows
      .filter((row) => !editableGroupIds || editableGroupIds.has(row.groupId))
      .map((row) => ({
        row,
        result: parseCreditsInput(groupLimitInputs[row.groupId] ?? ""),
      }));
    setGroupValidationMessages(
      Object.fromEntries(
        groupResults.map(({ row, result }) => [
          row.groupId,
          result.ok ? null : t(result.message),
        ])
      )
    );

    const newDefaultLimit = defaultLimitField.validate();

    if (
      !personalResult.ok ||
      newDefaultLimit === "invalid" ||
      groupResults.some(({ result }) => !result.ok)
    ) {
      return;
    }

    const personalChanged =
      personalResult.awuCredits !== initialPersonalOverride;
    const resetChanged =
      personalResult.awuCredits !== null &&
      resetAtNextBillingCycle !== initialResetAtNextBillingCycle;
    const groupChanges = groupResults.flatMap(({ row, result }) =>
      result.ok && result.awuCredits !== row.poolCapAwuCredits
        ? [{ row, awuCredits: result.awuCredits }]
        : []
    );
    if (
      !personalChanged &&
      !resetChanged &&
      newDefaultLimit === null &&
      groupChanges.length === 0
    ) {
      onClose();
      return;
    }

    setIsSaving(true);
    onSavingChange?.(member.sId, true);
    try {
      const tasks: Array<() => Promise<unknown>> = [];
      if (newDefaultLimit !== null) {
        tasks.push(() => doUpdateDefaultUserSpendLimit(newDefaultLimit));
      }
      if (personalChanged || resetChanged) {
        const limit = toSpendLimit(personalResult.awuCredits);
        tasks.push(() =>
          doUpdateSpendLimit({
            memberId: member.sId,
            memberName: member.name,
            limit,
            resetAtNextBillingCycle:
              limit.kind === "limited" ? resetAtNextBillingCycle : false,
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
      onSavingChange?.(member.sId, false);
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
            <DialogTitle>
              <Trans>Edit spend limit for {memberName}</Trans>
            </DialogTitle>
            <DialogDescription>
              {seatAllowanceAwuCredits > 0
                ? t`These limits cap what each member can spend, once their seat credits are used. Personal limits override workspace and group limits.`
                : t`These limits cap what each member can spend. Personal limits override workspace and group limits.`}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-5">
          {showDefaultLimit && (
            // Only relevant when the workspace default is actually what
            // caps this member: no personal override, and no group they're
            // in carries its own cap. Otherwise editing it here wouldn't
            // change this member's effective limit.
            <WorkspaceDefaultLimitInput
              field={defaultLimitField}
              readOnlyTooltip={
                !readOnly && !canEditDefaultLimit
                  ? t`Only workspace admins can edit the workspace default limit.`
                  : undefined
              }
              isActive={isDefaultActive}
            />
          )}

          <PersonalLimitInput
            value={personalLimitInput}
            readOnly={readOnly}
            isActive={hasPersonalOverride}
            validationMessage={validationMessage}
            onChange={(cleaned) => {
              setPersonalLimitInput(cleaned);
              setValidationMessage(null);
              if (cleaned === "") {
                setResetAtNextBillingCycle(false);
              }
            }}
            onRemove={
              personalLimitInput !== ""
                ? () => {
                    setPersonalLimitInput("");
                    setValidationMessage(null);
                    setResetAtNextBillingCycle(false);
                  }
                : undefined
            }
          />
          {!readOnly && personalLimitInput !== "" && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="reset-at-next-billing-cycle"
                checked={resetAtNextBillingCycle}
                onCheckedChange={(checked) =>
                  setResetAtNextBillingCycle(checked === true)
                }
              />
              <Label
                htmlFor="reset-at-next-billing-cycle"
                className="cursor-pointer text-sm font-normal leading-snug text-foreground"
              >
                {resetBaselineCredits === null ||
                resetBaselineCreditCount === null ? (
                  <Trans>
                    Reset to no personal limit at the next billing cycle
                  </Trans>
                ) : (
                  t`${plural(resetBaselineCreditCount, {
                    one: `Reset to ${resetBaselineCredits} credit at the next billing cycle`,
                    other: `Reset to ${resetBaselineCredits} credits at the next billing cycle`,
                  })}`
                )}
              </Label>
            </div>
          )}
          {editableGroupIds && (
            <span className="copy-xs text-muted-foreground">
              <Trans>
                A personal limit applies to this member across the workspace.
              </Trans>
            </span>
          )}

          {memberGroupRows.length > 0 && (
            <Page.Vertical gap="xs" align="stretch">
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                <Trans>Group limits</Trans>
              </span>
              <MemberGroupLimitTable
                rows={memberGroupRows}
                readOnly={readOnly}
                editableGroupIds={editableGroupIds}
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
          label: t`Cancel`,
          variant: "outline",
          onClick: onClose,
        }}
        rightButtonProps={{
          label: t`Validate`,
          variant: "highlight",
          disabled: isSaving || readOnly || defaultLimitField.isPending,
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
  member,
  owner,
  groups,
  editableGroupIds,
  readOnly = false,
  canEditDefaultLimit = false,
  defaultUserSpendLimit,
  onSavingChange,
  onSaved,
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
          editableGroupIds={editableGroupIds}
          readOnly={readOnly}
          canEditDefaultLimit={canEditDefaultLimit}
          defaultUserSpendLimit={defaultUserSpendLimit}
          onClose={onClose}
          onSavingChange={onSavingChange}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
