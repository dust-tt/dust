import { ConfirmContext } from "@app/components/Confirm";
import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import { BulkChangeSeatModal } from "@app/components/workspace/BulkChangeSeatModal";
import { CreditLimitInput } from "@app/components/workspace/CreditLimitInput";
import { GroupSeatPickerDropdown } from "@app/components/workspace/GroupSeatPickerDropdown";
import {
  parseCreditsInput,
  parseSharedUsageLimitInput,
  toSpendLimit,
} from "@app/components/workspace/member_spend_limit_helpers";
import { useUpdateGroupSharedUsageLimit } from "@app/hooks/useUpdateGroupSharedUsageLimit";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { formatCredits } from "@app/lib/client/credits";
import {
  useGroupSeatMappingPreview,
  useUpdateGroupGrantedSeatType,
  useUpdateGroupSpendLimit,
} from "@app/lib/swr/groups";
import type { SharedUsageLimitWithUsage } from "@app/types/api/groups/shared_usage_limit";
import type { GroupGrantableSeatType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useContext, useEffect, useRef, useState } from "react";

export interface EditGroupUsageGroup {
  groupId: string;
  name: string;
  memberCount: number;
  poolCapAwuCredits: number | null;
  grantedSeatType: GroupGrantableSeatType | null;
  sharedUsageLimitUsage: SharedUsageLimitWithUsage | undefined;
}

export interface EditGroupUsageSeatOptions {
  grantableSeatTypes: GroupGrantableSeatType[];
  seatPlans: SeatPlanResponseBody;
}

type SharedUsageLimitAccess = "hidden" | "readOnly" | "editable";

interface EditGroupUsageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  group: EditGroupUsageGroup | null;
  seatOptions?: EditGroupUsageSeatOptions;
  sharedUsageLimitAccess: SharedUsageLimitAccess;
}

export function EditGroupUsageDialog({
  isOpen,
  onClose,
  owner,
  group,
  seatOptions,
  sharedUsageLimitAccess,
}: EditGroupUsageDialogProps) {
  const lastGroupRef = useRef<EditGroupUsageGroup | null>(null);
  useEffect(() => {
    if (group) {
      lastGroupRef.current = group;
    }
  }, [group]);
  const displayedGroup = group ?? lastGroupRef.current;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="font-sans">
        {displayedGroup && (
          <EditGroupUsageForm
            key={`${displayedGroup.groupId}:${isOpen}`}
            owner={owner}
            group={displayedGroup}
            seatOptions={seatOptions}
            sharedUsageLimitAccess={sharedUsageLimitAccess}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function toInputValue(awuCredits: number | null) {
  return awuCredits === null ? "" : String(awuCredits);
}

function EditGroupUsageForm({
  owner,
  group,
  seatOptions,
  sharedUsageLimitAccess,
  onClose,
}: {
  owner: LightWorkspaceType;
  group: EditGroupUsageGroup;
  seatOptions?: EditGroupUsageSeatOptions;
  sharedUsageLimitAccess: SharedUsageLimitAccess;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const confirm = useContext(ConfirmContext);
  const { doUpdateGroupSpendLimit } = useUpdateGroupSpendLimit({
    workspaceId: owner.sId,
  });
  const { doUpdateGroupSharedUsageLimit } = useUpdateGroupSharedUsageLimit({
    owner,
  });
  const { doUpdateGroupGrantedSeatType } = useUpdateGroupGrantedSeatType({
    owner,
  });
  const { doFetchGroupSeatMappingPreview } = useGroupSeatMappingPreview({
    owner,
  });

  const initialSharedLimitAwuCredits =
    group.sharedUsageLimitUsage?.limitAwuCredits ?? null;
  const [memberLimitInput, setMemberLimitInput] = useState(
    toInputValue(group.poolCapAwuCredits)
  );
  const [sharedLimitInput, setSharedLimitInput] = useState(
    toInputValue(initialSharedLimitAwuCredits)
  );
  const [seat, setSeat] = useState(group.grantedSeatType);
  const [isSeatReviewOpen, setIsSeatReviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { groupId, name: groupName, memberCount } = group;
  const isSharedLimitEditable = sharedUsageLimitAccess === "editable";
  const memberLimitResult = parseCreditsInput(memberLimitInput);
  const sharedLimitResult = parseSharedUsageLimitInput(sharedLimitInput);

  const memberLimitChanged =
    memberLimitResult.ok &&
    memberLimitResult.awuCredits !== group.poolCapAwuCredits;
  const sharedLimitChanged =
    isSharedLimitEditable &&
    sharedLimitResult.ok &&
    sharedLimitResult.awuCredits !== initialSharedLimitAwuCredits;
  const seatChanged =
    seatOptions !== undefined && seat !== group.grantedSeatType;
  const isValid =
    memberLimitResult.ok && (!isSharedLimitEditable || sharedLimitResult.ok);
  const isChanged = memberLimitChanged || sharedLimitChanged || seatChanged;

  const saveChanges = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const results = await Promise.all([
        memberLimitChanged
          ? doUpdateGroupSpendLimit({
              groupId,
              groupName,
              limit: toSpendLimit(memberLimitResult.awuCredits),
            }).then((body) => body !== null)
          : true,
        sharedLimitChanged
          ? doUpdateGroupSharedUsageLimit({
              groupId,
              groupName,
              limit: toSpendLimit(sharedLimitResult.awuCredits),
            })
          : true,
        seatChanged
          ? doUpdateGroupGrantedSeatType({
              groupId,
              groupName,
              grantedSeatType: seat,
            }).then((body) => body !== null)
          : true,
      ]);
      const saved = results.every(Boolean);
      if (saved) {
        onClose();
      }
      return saved;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!isValid) {
      return;
    }
    if (!isChanged) {
      onClose();
      return;
    }
    if (seatChanged && seat !== null) {
      setIsSeatReviewOpen(true);
      return;
    }
    if (seatChanged && group.grantedSeatType !== null) {
      const seatName = seatTypeDisplayName(group.grantedSeatType, t);
      const confirmed = await confirm({
        title: t`Remove group seat`,
        message: t`Members of ${groupName} will lose their ${seatName} seat at the end of the current billing period. Members who also get this seat (or a higher one) from another group keep it. This affects up to ${plural(
          memberCount,
          { one: "# member", other: "# members" }
        )}.`,
        validateLabel: t`Remove seat`,
        validateVariant: "warning",
        cancelLabel: t`Cancel`,
      });
      if (!confirmed) {
        return;
      }
    }
    await saveChanges();
  };

  const reviewSeatName = seat ? seatTypeDisplayName(seat, t) : null;
  const removeLabel = t({
    message: "Remove",
    context: "remove a credit limit, button label",
  });
  const removeAction = (value: string, setValue: (value: string) => void) =>
    value !== ""
      ? { label: removeLabel, onClick: () => setValue("") }
      : undefined;
  const usedCredits = group.sharedUsageLimitUsage
    ? formatCredits(group.sharedUsageLimitUsage.usedAwuCredits)
    : null;
  const groupBudgetDescription =
    !isSharedLimitEditable && initialSharedLimitAwuCredits === null
      ? t`This group has no budget.`
      : usedCredits === null
        ? t`Shared by all members.`
        : t`Shared by all members. ${usedCredits} credits used so far this cycle.`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t`Edit limits for ${groupName}`}</DialogTitle>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-6">
          {seatOptions && (
            <Page.Vertical gap="xs" align="stretch">
              <span className="text-sm font-medium text-foreground">
                {t`Granted seat`}
              </span>
              <GroupSeatPickerDropdown
                value={seat}
                grantableSeatTypes={seatOptions.grantableSeatTypes}
                disabled={isSaving}
                onChange={setSeat}
              />
            </Page.Vertical>
          )}
          {sharedUsageLimitAccess !== "hidden" && (
            <CreditLimitInput
              label={t`Group budget`}
              value={sharedLimitInput}
              readOnly={!isSharedLimitEditable || isSaving}
              validationMessage={
                sharedLimitResult.ok ? null : t(sharedLimitResult.message)
              }
              onChange={setSharedLimitInput}
              description={groupBudgetDescription}
              descriptionStatus="info"
              action={removeAction(sharedLimitInput, setSharedLimitInput)}
            />
          )}
          <CreditLimitInput
            label={t`Limit per member`}
            value={memberLimitInput}
            readOnly={isSaving}
            validationMessage={
              memberLimitResult.ok ? null : t(memberLimitResult.message)
            }
            onChange={setMemberLimitInput}
            description={t`Caps what each member can spend.`}
            action={removeAction(memberLimitInput, setMemberLimitInput)}
          />
        </div>
      </DialogContainer>
      <DialogFooter
        leftButtonProps={{
          label: t`Cancel`,
          variant: "outline",
          disabled: isSaving,
          onClick: onClose,
        }}
        rightButtonProps={{
          label: t`Save`,
          variant: "highlight",
          disabled: isSaving || !isValid || !isChanged,
          isLoading: isSaving,
          onClick: handleSave,
        }}
      />
      {isSeatReviewOpen && seat && seatOptions && (
        <BulkChangeSeatModal
          isOpen
          onClose={() => setIsSeatReviewOpen(false)}
          title={t`Grant ${reviewSeatName} to ${groupName}`}
          memberCount={memberCount}
          selectedMembers={[]}
          seatPlans={seatOptions.seatPlans}
          presetSeatType={seat}
          onFetchPreview={() =>
            doFetchGroupSeatMappingPreview({ groupId, seatType: seat })
          }
          onValidate={saveChanges}
        />
      )}
    </>
  );
}
