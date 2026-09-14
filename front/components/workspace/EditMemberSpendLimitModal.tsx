import { CreditLimitInput } from "@app/components/workspace/CreditLimitInput";
import { MemberGroupLimitTable } from "@app/components/workspace/MemberGroupLimitTable";
import {
  groupRowsForMember,
  parseCreditsInput,
  parseDefaultLimitInput,
  toSpendLimit,
} from "@app/components/workspace/member_spend_limit_helpers";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatCredits } from "@app/lib/client/credits";
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

// TODO(spend-limit-modal-rollout): remove `EditSpendLimitModal`
// once the usage page has fully rolled onto this
// component, so there's a single spend-limit editing implementation again.
// The bulk edit modal stays: it covers a different flow.

// Fetched by the caller since the customer-facing app and poke reach the
// value through different routes. "unavailable" means the workspace has no
// default pool limit at all, so the field is not shown.
export type DefaultUserSpendLimitState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; awuCredits: number };

interface EditMemberSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberUsageType | null;
  owner: LightWorkspaceType;
  groups: GroupType[];
  readOnly?: boolean;
  // The workspace default applies to every member, so editing it is reserved
  // to admins even where managers may edit personal and group limits.
  canEditDefaultLimit?: boolean;
  defaultUserSpendLimit: DefaultUserSpendLimitState;
}

interface MemberSpendLimitFormProps {
  member: MemberUsageType | null;
  owner: LightWorkspaceType;
  groups: GroupType[];
  readOnly: boolean;
  canEditDefaultLimit: boolean;
  defaultUserSpendLimit: DefaultUserSpendLimitState;
  onClose: () => void;
}

function MemberSpendLimitForm({
  member,
  owner,
  groups,
  readOnly,
  canEditDefaultLimit,
  defaultUserSpendLimit,
  onClose,
}: MemberSpendLimitFormProps) {
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
  const canChangeDefaultLimit =
    showDefaultLimit && canEditDefaultLimit && !readOnly;
  const isDefaultLimitLoaded = defaultUserSpendLimit.status === "ready";
  const loadedDefaultLimitAwuCredits = isDefaultLimitLoaded
    ? defaultUserSpendLimit.awuCredits
    : undefined;
  // While the workspace default is still loading, block saving instead of
  // treating the unresolved value as unchanged (which would let an admin
  // silently commit whatever ends up in the input once it finally arrives).
  // Viewers who cannot edit it are not held back by its loading state, and a
  // failed fetch only locks this field rather than the whole form.
  const isDefaultLimitPending =
    canChangeDefaultLimit && defaultUserSpendLimit.status === "loading";
  const canSubmitDefaultLimit = canChangeDefaultLimit && isDefaultLimitLoaded;

  // The draft stays null until the user types, so the loaded value can show
  // up once fetched without remounting the form (which would drop whatever
  // was typed in the other fields meanwhile).
  const [defaultLimitDraft, setDefaultLimitDraft] = useState<string | null>(
    null
  );
  const defaultLimitInput =
    defaultLimitDraft ??
    (loadedDefaultLimitAwuCredits !== undefined
      ? String(loadedDefaultLimitAwuCredits)
      : "");
  const [defaultLimitValidationMessage, setDefaultLimitValidationMessage] =
    useState<string | null>(null);

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
    if (!member || isDefaultLimitPending) {
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

    // Only validated when this viewer may change it and the current value is
    // known, so a locked or unloaded field can never block saving the other
    // limits.
    const defaultLimitResult = canSubmitDefaultLimit
      ? parseDefaultLimitInput(defaultLimitInput)
      : null;
    setDefaultLimitValidationMessage(
      defaultLimitResult && !defaultLimitResult.ok
        ? defaultLimitResult.message
        : null
    );

    if (
      !personalResult.ok ||
      (defaultLimitResult && !defaultLimitResult.ok) ||
      groupResults.some(({ result }) => !result.ok)
    ) {
      return;
    }

    const personalChanged =
      personalResult.awuCredits !== initialPersonalOverride;
    const groupChanges = groupResults.flatMap(({ row, result }) =>
      result.ok && result.awuCredits !== row.poolCapAwuCredits
        ? [{ row, awuCredits: result.awuCredits }]
        : []
    );
    const newDefaultLimit =
      defaultLimitResult?.ok &&
      defaultLimitResult.awuCredits !== loadedDefaultLimitAwuCredits
        ? defaultLimitResult.awuCredits
        : null;

    if (
      !personalChanged &&
      newDefaultLimit === null &&
      groupChanges.length === 0
    ) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const tasks: Array<() => Promise<unknown>> = [];
      if (newDefaultLimit !== null) {
        tasks.push(() => doUpdateDefaultUserSpendLimit(newDefaultLimit));
      }
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
              {seatAllowanceAwuCredits > 0 ? (
                <>
                  This user can currently consume{" "}
                  {formatCredits(seatAllowanceAwuCredits)} credits from their
                  seat, plus {formatCredits(extraAwuCredits)} on the&nbsp;pool.
                </>
              ) : (
                <>
                  This user can currently consume{" "}
                  {formatCredits(extraAwuCredits)} credits from the workspace
                  credit&nbsp;pool.
                </>
              )}
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
            <CreditLimitInput
              label="Workspace default limit"
              value={defaultLimitInput}
              readOnly={!canSubmitDefaultLimit}
              readOnlyTooltip={
                !readOnly && !canEditDefaultLimit
                  ? "Only workspace admins can edit the workspace default limit."
                  : undefined
              }
              isActive={isDefaultActive}
              validationMessage={
                defaultUserSpendLimit.status === "error"
                  ? "The workspace default limit could not be loaded."
                  : defaultLimitValidationMessage
              }
              onChange={(cleaned) => {
                setDefaultLimitDraft(cleaned);
                setDefaultLimitValidationMessage(null);
              }}
            />
          )}

          <CreditLimitInput
            label="Personal limit"
            value={personalLimitInput}
            readOnly={readOnly}
            isActive={hasPersonalOverride}
            validationMessage={validationMessage}
            onChange={(cleaned) => {
              setPersonalLimitInput(cleaned);
              setValidationMessage(null);
            }}
            action={
              personalLimitInput !== ""
                ? {
                    label: "Remove personal limit",
                    onClick: () => {
                      setPersonalLimitInput("");
                      setValidationMessage(null);
                    },
                  }
                : undefined
            }
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
          disabled: isSaving || readOnly || isDefaultLimitPending,
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
  readOnly = false,
  canEditDefaultLimit = false,
  defaultUserSpendLimit,
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
          canEditDefaultLimit={canEditDefaultLimit}
          defaultUserSpendLimit={defaultUserSpendLimit}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
