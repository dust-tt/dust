import { ConfirmContext } from "@app/components/Confirm";
import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import { BulkChangeSeatModal } from "@app/components/workspace/BulkChangeSeatModal";
import { CreditLimitInput } from "@app/components/workspace/CreditLimitInput";
import {
  applyBudgetOrderMoves,
  getBaseBudgetOrder,
  isSameBudgetOrder,
  moveGroupPastVisibleNeighbor,
} from "@app/components/workspace/group_budget_order";
import type { GroupBudgetOrderRow } from "@app/components/workspace/GroupBudgetOrderTab";
import { GroupBudgetOrderTab } from "@app/components/workspace/GroupBudgetOrderTab";
import { GroupSeatPickerDropdown } from "@app/components/workspace/GroupSeatPickerDropdown";
import {
  parseCreditsInput,
  parseSharedUsageLimitInput,
  toSpendLimit,
} from "@app/components/workspace/member_spend_limit_helpers";
import { useGroupsUsage } from "@app/hooks/useGroupsUsage";
import { useSharedUsageLimitOverlaps } from "@app/hooks/useSharedUsageLimitOverlaps";
import { useUpdateGroupSharedUsageLimit } from "@app/hooks/useUpdateGroupSharedUsageLimit";
import { useUpdateSharedUsageLimitPriorities } from "@app/hooks/useUpdateSharedUsageLimitPriorities";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { formatCredits, roundCredits } from "@app/lib/client/credits";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
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
      <DialogContent
        size={sharedUsageLimitAccess === "editable" ? "xl" : "md"}
        className="font-sans"
      >
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

function useRemoveAction() {
  const { t } = useLingui();
  const label = t({
    message: "Remove",
    context: "remove a credit limit, button label",
  });
  return (value: string, setValue: (value: string) => void) =>
    value !== "" ? { label, onClick: () => setValue("") } : undefined;
}

function useGroupUsageDraft(
  group: EditGroupUsageGroup,
  seatOptions: EditGroupUsageSeatOptions | undefined,
  isSharedLimitEditable: boolean
) {
  const initialSharedLimitAwuCredits =
    group.sharedUsageLimitUsage?.limitAwuCredits ?? null;
  const [memberLimitInput, setMemberLimitInput] = useState(() =>
    toInputValue(group.poolCapAwuCredits)
  );
  const [sharedLimitInput, setSharedLimitInput] = useState(() =>
    toInputValue(initialSharedLimitAwuCredits)
  );
  const [seat, setSeat] = useState(group.grantedSeatType);

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

  return {
    memberLimitInput,
    setMemberLimitInput,
    memberLimitResult,
    memberLimitChanged,
    sharedLimitInput,
    setSharedLimitInput,
    sharedLimitResult,
    sharedLimitChanged,
    seat,
    setSeat,
    seatChanged,
    isValid:
      memberLimitResult.ok && (!isSharedLimitEditable || sharedLimitResult.ok),
    isChanged: memberLimitChanged || sharedLimitChanged || seatChanged,
  };
}

type GroupUsageDraft = ReturnType<typeof useGroupUsageDraft>;

function useGroupBudgetOrderDraft(
  owner: LightWorkspaceType,
  group: EditGroupUsageGroup,
  draft: GroupUsageDraft,
  isEnabled: boolean
) {
  const { overlaps, hasLoadedOverlaps, isOverlapsLoading, overlapsError } =
    useSharedUsageLimitOverlaps({
      owner,
      groupId: group.groupId,
      disabled: !isEnabled,
    });
  const { usageByGroupId } = useGroupsUsage({ owner, disabled: !isEnabled });
  const [movedOrder, setMovedOrder] = useState<string[] | null>(null);

  const budgetAwuCredits = draft.sharedLimitResult.ok
    ? draft.sharedLimitResult.awuCredits
    : (group.sharedUsageLimitUsage?.limitAwuCredits ?? null);
  const baseOrder = getBaseBudgetOrder(
    overlaps.map((overlap) => overlap.groupId),
    group.groupId,
    budgetAwuCredits !== null
  );
  const order = applyBudgetOrderMoves(movedOrder, baseOrder);
  const overlapByGroupId = new Map(
    overlaps.map((overlap) => [overlap.groupId, overlap])
  );

  const rows: GroupBudgetOrderRow[] = order.map((groupId, index) => {
    const overlap = overlapByGroupId.get(groupId);
    return groupId === group.groupId || !overlap
      ? {
          groupId,
          name: group.name,
          position: index + 1,
          limitAwuCredits: budgetAwuCredits,
          usedAwuCredits: usageByGroupId.get(groupId)?.usedAwuCredits ?? 0,
          sharedMemberCount: null,
          isCurrentGroup: true,
        }
      : {
          ...overlap,
          position: index + 1,
          usedAwuCredits: usageByGroupId.get(groupId)?.usedAwuCredits ?? 0,
          isCurrentGroup: false,
        };
  });

  return {
    rows,
    order,
    baseOrder,
    isOrderChanged: hasLoadedOverlaps && !isSameBudgetOrder(order, baseOrder),
    isOverlapsLoading,
    overlapsError,
    moveGroup: (
      groupId: string,
      direction: "up" | "down",
      visibleGroupIds: string[]
    ) =>
      setMovedOrder(
        moveGroupPastVisibleNeighbor(order, visibleGroupIds, groupId, direction)
      ),
  };
}

type GroupBudgetOrderDraft = ReturnType<typeof useGroupBudgetOrderDraft>;

function useSaveGroupUsage(
  owner: LightWorkspaceType,
  group: EditGroupUsageGroup,
  draft: GroupUsageDraft,
  orderDraft: GroupBudgetOrderDraft,
  onClose: () => void
) {
  const { doUpdateSharedUsageLimitPriorities } =
    useUpdateSharedUsageLimitPriorities({ owner });
  const { doUpdateGroupSpendLimit } = useUpdateGroupSpendLimit({
    workspaceId: owner.sId,
  });
  const { doUpdateGroupSharedUsageLimit } = useUpdateGroupSharedUsageLimit({
    owner,
  });
  const { doUpdateGroupGrantedSeatType } = useUpdateGroupGrantedSeatType({
    owner,
  });
  const [isSaving, setIsSaving] = useState(false);
  const { groupId, name: groupName } = group;

  const saveChanges = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const results = await Promise.all([
        draft.memberLimitChanged && draft.memberLimitResult.ok
          ? doUpdateGroupSpendLimit({
              groupId,
              groupName,
              limit: toSpendLimit(draft.memberLimitResult.awuCredits),
            }).then((body) => body !== null)
          : true,
        draft.sharedLimitChanged && draft.sharedLimitResult.ok
          ? doUpdateGroupSharedUsageLimit({
              groupId,
              groupName,
              limit: toSpendLimit(draft.sharedLimitResult.awuCredits),
            })
          : true,
        draft.seatChanged
          ? doUpdateGroupGrantedSeatType({
              groupId,
              groupName,
              grantedSeatType: draft.seat,
            }).then((body) => body !== null)
          : true,
      ]);
      const saved =
        results.every(Boolean) &&
        (!orderDraft.isOrderChanged ||
          (await doUpdateSharedUsageLimitPriorities({
            orderedGroupIds: orderDraft.order,
            expectedOrderedGroupIds: orderDraft.baseOrder,
          })));
      if (saved) {
        onClose();
      }
      return saved;
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, saveChanges };
}

function useConfirmSeatRemoval(group: EditGroupUsageGroup) {
  const { t } = useLingui();
  const confirm = useContext(ConfirmContext);
  const { name: groupName, memberCount } = group;

  return (removedSeat: GroupGrantableSeatType) => {
    const seatName = seatTypeDisplayName(removedSeat, t);
    return confirm({
      title: t`Remove group seat`,
      message: t`Members of ${groupName} will lose their ${seatName} seat at the end of the current billing period. Members who also get this seat (or a higher one) from another group keep it. This affects up to ${plural(
        memberCount,
        { one: "# member", other: "# members" }
      )}.`,
      validateLabel: t`Remove seat`,
      validateVariant: "warning",
      cancelLabel: t`Cancel`,
    });
  };
}

interface GroupBudgetFieldProps {
  group: EditGroupUsageGroup;
  draft: GroupUsageDraft;
  isEditable: boolean;
  isSaving: boolean;
}

function GroupBudgetField({
  group,
  draft,
  isEditable,
  isSaving,
}: GroupBudgetFieldProps) {
  const { t } = useLingui();
  const removeAction = useRemoveAction();
  const usage = group.sharedUsageLimitUsage;

  let description = t`Shared by all members.`;
  if (!isEditable && !usage) {
    description = t`This group has no budget.`;
  } else if (usage) {
    const usedCredits = formatCredits(usage.usedAwuCredits);
    const usedCreditCount = roundCredits(usage.usedAwuCredits);
    description = t`${plural(usedCreditCount, {
      one: `Shared by all members. ${usedCredits} credit used so far this cycle.`,
      other: `Shared by all members. ${usedCredits} credits used so far this cycle.`,
    })}`;
  }

  return (
    <CreditLimitInput
      label={t`Group budget`}
      value={draft.sharedLimitInput}
      readOnly={!isEditable || isSaving}
      validationMessage={
        draft.sharedLimitResult.ok ? null : t(draft.sharedLimitResult.message)
      }
      onChange={draft.setSharedLimitInput}
      description={description}
      action={removeAction(draft.sharedLimitInput, draft.setSharedLimitInput)}
    />
  );
}

interface GroupSeatReviewModalProps {
  owner: LightWorkspaceType;
  group: EditGroupUsageGroup;
  seat: GroupGrantableSeatType;
  seatPlans: SeatPlanResponseBody;
  onClose: () => void;
  onValidate: () => Promise<boolean>;
}

function GroupSeatReviewModal({
  owner,
  group,
  seat,
  seatPlans,
  onClose,
  onValidate,
}: GroupSeatReviewModalProps) {
  const { t } = useLingui();
  const { doFetchGroupSeatMappingPreview } = useGroupSeatMappingPreview({
    owner,
  });
  const reviewSeatName = seatTypeDisplayName(seat, t);
  const { groupId, name: groupName } = group;

  return (
    <BulkChangeSeatModal
      isOpen
      onClose={onClose}
      title={t`Grant ${reviewSeatName} to ${groupName}`}
      memberCount={group.memberCount}
      selectedMembers={[]}
      seatPlans={seatPlans}
      presetSeatType={seat}
      onFetchPreview={() =>
        doFetchGroupSeatMappingPreview({ groupId, seatType: seat })
      }
      onValidate={onValidate}
    />
  );
}

interface GroupLimitsFieldsProps {
  group: EditGroupUsageGroup;
  draft: GroupUsageDraft;
  seatOptions?: EditGroupUsageSeatOptions;
  sharedUsageLimitAccess: SharedUsageLimitAccess;
  isSaving: boolean;
}

function GroupLimitsFields({
  group,
  draft,
  seatOptions,
  sharedUsageLimitAccess,
  isSaving,
}: GroupLimitsFieldsProps) {
  const { t } = useLingui();
  const removeAction = useRemoveAction();

  return (
    <div className="flex flex-col gap-6">
      {seatOptions && (
        <Page.Vertical gap="xs" align="stretch">
          <span className="text-sm font-medium text-foreground">
            {t`Granted seat`}
          </span>
          <GroupSeatPickerDropdown
            value={draft.seat}
            grantableSeatTypes={seatOptions.grantableSeatTypes}
            disabled={isSaving}
            onChange={draft.setSeat}
          />
        </Page.Vertical>
      )}
      {sharedUsageLimitAccess !== "hidden" && (
        <GroupBudgetField
          group={group}
          draft={draft}
          isEditable={sharedUsageLimitAccess === "editable"}
          isSaving={isSaving}
        />
      )}
      <CreditLimitInput
        label={t`Limit per member`}
        value={draft.memberLimitInput}
        readOnly={isSaving}
        validationMessage={
          draft.memberLimitResult.ok ? null : t(draft.memberLimitResult.message)
        }
        onChange={draft.setMemberLimitInput}
        placeholder={t`No limit`}
        description={t`Caps what each member can spend.`}
        action={removeAction(draft.memberLimitInput, draft.setMemberLimitInput)}
      />
    </div>
  );
}

interface EditGroupUsageFormProps {
  owner: LightWorkspaceType;
  group: EditGroupUsageGroup;
  seatOptions?: EditGroupUsageSeatOptions;
  sharedUsageLimitAccess: SharedUsageLimitAccess;
  onClose: () => void;
}

function EditGroupUsageForm({
  owner,
  group,
  seatOptions,
  sharedUsageLimitAccess,
  onClose,
}: EditGroupUsageFormProps) {
  const { t } = useLingui();
  const isSharedLimitEditable = sharedUsageLimitAccess === "editable";
  const draft = useGroupUsageDraft(group, seatOptions, isSharedLimitEditable);
  const orderDraft = useGroupBudgetOrderDraft(
    owner,
    group,
    draft,
    isSharedLimitEditable
  );
  const { isSaving, saveChanges } = useSaveGroupUsage(
    owner,
    group,
    draft,
    orderDraft,
    onClose
  );
  const confirmSeatRemoval = useConfirmSeatRemoval(group);
  const [isSeatReviewOpen, setIsSeatReviewOpen] = useState(false);
  const groupName = group.name;
  const isChanged = draft.isChanged || orderDraft.isOrderChanged;

  const handleSave = async () => {
    if (!isChanged) {
      onClose();
      return;
    }
    if (draft.seatChanged && draft.seat !== null) {
      setIsSeatReviewOpen(true);
      return;
    }
    if (
      draft.seatChanged &&
      group.grantedSeatType !== null &&
      !(await confirmSeatRemoval(group.grantedSeatType))
    ) {
      return;
    }
    await saveChanges();
  };

  const limitsFields = (
    <GroupLimitsFields
      group={group}
      draft={draft}
      seatOptions={seatOptions}
      sharedUsageLimitAccess={sharedUsageLimitAccess}
      isSaving={isSaving}
    />
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t`Edit limits for ${groupName}`}</DialogTitle>
      </DialogHeader>
      {isSharedLimitEditable ? (
        <Tabs defaultValue="limits">
          <div className="px-5 pt-3">
            <TabsList>
              <TabsTrigger value="limits" label={t`Limits`} />
              <TabsTrigger value="order" label={t`Order`} />
            </TabsList>
          </div>
          <TabsContent value="limits">
            <DialogContainer>{limitsFields}</DialogContainer>
          </TabsContent>
          <TabsContent value="order">
            <DialogContainer>
              <GroupBudgetOrderTab
                groupName={groupName}
                rows={orderDraft.rows}
                isLoading={orderDraft.isOverlapsLoading}
                error={orderDraft.overlapsError}
                disabled={isSaving}
                onMove={orderDraft.moveGroup}
              />
            </DialogContainer>
          </TabsContent>
        </Tabs>
      ) : (
        <DialogContainer>{limitsFields}</DialogContainer>
      )}
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
          disabled: isSaving || !draft.isValid || !isChanged,
          isLoading: isSaving,
          onClick: handleSave,
        }}
      />
      {isSeatReviewOpen && draft.seat && seatOptions && (
        <GroupSeatReviewModal
          owner={owner}
          group={group}
          seat={draft.seat}
          seatPlans={seatOptions.seatPlans}
          onClose={() => setIsSeatReviewOpen(false)}
          onValidate={saveChanges}
        />
      )}
    </>
  );
}
