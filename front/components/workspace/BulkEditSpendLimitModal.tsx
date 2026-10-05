import { PersonalLimitInput } from "@app/components/workspace/CreditLimitInput";
import {
  parseCreditsInput,
  toSpendLimit,
} from "@app/components/workspace/member_spend_limit_helpers";
import type { DefaultUserSpendLimitState } from "@app/components/workspace/WorkspaceDefaultLimitInput";
import {
  useWorkspaceDefaultLimitField,
  WorkspaceDefaultLimitInput,
} from "@app/components/workspace/WorkspaceDefaultLimitInput";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { formatNumber } from "@app/lib/i18n/format";
import { useUpdateDefaultUserSpendLimit } from "@app/lib/swr/usage_settings";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import { pluralize } from "@app/types/shared/utils/string_utils";
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
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

interface BulkEditSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberCount: number;
  selectedMembers: MemberUsageType[];
  owner: LightWorkspaceType;
  // Whether any seat on the workspace's contract carries a built-in credit
  // allowance. When it doesn't (e.g. pooled plans with no per-seat allowance),
  // the pool limit is the member's whole monthly budget rather than a top-up.
  seatsHaveBuiltInAllowance: boolean;
  canEditDefaultLimit: boolean;
  defaultUserSpendLimit: DefaultUserSpendLimitState;
  onValidate: (limit: UserSpendLimit) => Promise<boolean>;
  onSaved: () => void;
}

export function BulkEditSpendLimitModal({
  isOpen,
  onClose,
  memberCount,
  selectedMembers,
  owner,
  seatsHaveBuiltInAllowance,
  canEditDefaultLimit,
  defaultUserSpendLimit,
  onValidate,
  onSaved,
}: BulkEditSpendLimitModalProps) {
  const lastSelectionRef = useRef({ memberCount, selectedMembers });
  useEffect(() => {
    if (memberCount > 0) {
      lastSelectionRef.current = { memberCount, selectedMembers };
    }
  }, [memberCount, selectedMembers]);
  const displayed =
    memberCount > 0
      ? { memberCount, selectedMembers }
      : lastSelectionRef.current;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* Without this, the dialog auto-focuses the avatar stack's tooltip
          trigger, which opens the members tooltip as soon as it appears. */}
      <DialogContent
        size="md"
        className="font-sans"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <BulkEditSpendLimitForm
          key={String(isOpen)}
          onClose={onClose}
          memberCount={displayed.memberCount}
          selectedMembers={displayed.selectedMembers}
          owner={owner}
          seatsHaveBuiltInAllowance={seatsHaveBuiltInAllowance}
          canEditDefaultLimit={canEditDefaultLimit}
          defaultUserSpendLimit={defaultUserSpendLimit}
          onValidate={onValidate}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

interface BulkEditSpendLimitFormProps {
  onClose: () => void;
  memberCount: number;
  selectedMembers: MemberUsageType[];
  owner: LightWorkspaceType;
  seatsHaveBuiltInAllowance: boolean;
  canEditDefaultLimit: boolean;
  defaultUserSpendLimit: DefaultUserSpendLimitState;
  onValidate: (limit: UserSpendLimit) => Promise<boolean>;
  onSaved: () => void;
}

function BulkEditSpendLimitForm({
  onClose,
  memberCount,
  selectedMembers,
  owner,
  seatsHaveBuiltInAllowance,
  canEditDefaultLimit,
  defaultUserSpendLimit,
  onValidate,
  onSaved,
}: BulkEditSpendLimitFormProps) {
  const { doUpdateDefaultUserSpendLimit } = useUpdateDefaultUserSpendLimit({
    workspaceId: owner.sId,
  });
  const showDefaultLimit = defaultUserSpendLimit.status !== "unavailable";
  const defaultLimitField = useWorkspaceDefaultLimitField({
    defaultUserSpendLimit,
    canEdit: canEditDefaultLimit,
  });

  const [personalLimitInput, setPersonalLimitInput] = useState<string>("");
  const [removeRequested, setRemoveRequested] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  const isPersonalLimitChanged = personalLimitInput !== "" || removeRequested;

  async function handleValidate(event: React.MouseEvent) {
    event.preventDefault();
    const result = parseCreditsInput(personalLimitInput);
    setValidationMessage(result.ok ? null : result.message);
    const newDefaultLimit = defaultLimitField.validate();
    if (!result.ok || newDefaultLimit === "invalid") {
      return;
    }
    setIsSaving(true);
    try {
      const outcomes = await Promise.all([
        newDefaultLimit !== null
          ? doUpdateDefaultUserSpendLimit(newDefaultLimit).then(
              (body) => body !== null
            )
          : true,
        isPersonalLimitChanged
          ? onValidate(toSpendLimit(result.awuCredits))
          : true,
      ]);
      if (outcomes.every(Boolean)) {
        onSaved();
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
          {selectedMembers.length > 0 && (
            <Avatar.Stack
              avatars={selectedMembers.map((member) => ({
                name: member.name,
                visual: member.image ?? undefined,
                isRounded: true,
              }))}
              size="md"
            />
          )}
          <div className="flex flex-col gap-1">
            <DialogTitle>
              {`Set personal limit for ${formatNumber(memberCount)} member${pluralize(memberCount)}`}
            </DialogTitle>
            <DialogDescription>
              {`These limits cap what each member can spend${
                seatsHaveBuiltInAllowance
                  ? ", once their seat credits are used"
                  : ""
              }. Personal limits override workspace and group limits.`}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-5">
          {showDefaultLimit && (
            <WorkspaceDefaultLimitInput
              field={defaultLimitField}
              readOnlyTooltip={
                !canEditDefaultLimit
                  ? "Only workspace admins can edit the workspace default limit."
                  : undefined
              }
              isActive={false}
            />
          )}
          <div>
            <PersonalLimitInput
              value={personalLimitInput}
              readOnly={false}
              validationMessage={validationMessage}
              onChange={(cleaned) => {
                setPersonalLimitInput(cleaned);
                setRemoveRequested(false);
                setValidationMessage(null);
              }}
              onRemove={() => {
                setPersonalLimitInput("");
                setRemoveRequested(true);
                setValidationMessage(null);
              }}
            />
            {removeRequested && (
              <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                {`Personal limit${pluralize(memberCount)} will be removed for ${formatNumber(memberCount)} member${pluralize(memberCount)}. They will fall back to the workspace default.`}
              </p>
            )}
          </div>
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
          disabled:
            isSaving ||
            defaultLimitField.isPending ||
            (!isPersonalLimitChanged && !defaultLimitField.isChanged),
          isLoading: isSaving,
          onClick: handleValidate,
        }}
      />
    </>
  );
}
