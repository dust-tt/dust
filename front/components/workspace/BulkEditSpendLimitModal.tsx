import { BulkMembersModalHeader } from "@app/components/workspace/BulkMembersModalHeader";
import { PersonalLimitInput } from "@app/components/workspace/CreditLimitInput";
import {
  parseCreditsInput,
  toSpendLimit,
} from "@app/components/workspace/member_spend_limit_helpers";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

interface BulkEditSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberCount: number;
  // Selected members visible on the current page, for the header avatar row.
  // With an "all across pages" selection this is only the visible subset.
  selectedMembers: MemberUsageType[];
  // Whether any seat on the workspace's contract carries a built-in credit
  // allowance. When it doesn't (e.g. pooled plans with no per-seat allowance),
  // the pool limit is the member's whole monthly budget rather than a top-up.
  seatsHaveBuiltInAllowance: boolean;
  onValidate: (limit: UserSpendLimit) => Promise<boolean>;
}

export function BulkEditSpendLimitModal({
  isOpen,
  onClose,
  memberCount,
  selectedMembers,
  seatsHaveBuiltInAllowance,
  onValidate,
}: BulkEditSpendLimitModalProps) {
  // A successful save clears the selection upstream: keep showing the last
  // targeted members while the dialog closes rather than "0 members".
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
          // Remounts with fresh draft state on every open instead of
          // unmounting, so the content stays visible while the dialog closes.
          key={String(isOpen)}
          onClose={onClose}
          memberCount={displayed.memberCount}
          selectedMembers={displayed.selectedMembers}
          seatsHaveBuiltInAllowance={seatsHaveBuiltInAllowance}
          onValidate={onValidate}
        />
      </DialogContent>
    </Dialog>
  );
}

interface BulkEditSpendLimitFormProps {
  onClose: () => void;
  memberCount: number;
  selectedMembers: MemberUsageType[];
  seatsHaveBuiltInAllowance: boolean;
  onValidate: (limit: UserSpendLimit) => Promise<boolean>;
}

function BulkEditSpendLimitForm({
  onClose,
  memberCount,
  selectedMembers,
  seatsHaveBuiltInAllowance,
  onValidate,
}: BulkEditSpendLimitFormProps) {
  const [personalLimitInput, setPersonalLimitInput] = useState<string>("");
  // The field starts empty, so emptiness alone can't mean "remove": removal
  // must be asked for explicitly before it can be validated.
  const [removeRequested, setRemoveRequested] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  async function handleValidate() {
    const result = parseCreditsInput(personalLimitInput);
    if (!result.ok) {
      setValidationMessage(result.message);
      return;
    }
    setIsSaving(true);
    try {
      // A requested removal leaves the field empty, which falls back to the
      // workspace default.
      const ok = await onValidate(toSpendLimit(result.awuCredits));
      if (ok) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <BulkMembersModalHeader
        selectedMembers={selectedMembers}
        memberCount={memberCount}
        title={`Set personal limit for ${memberCount.toLocaleString("en-US")} member${pluralize(memberCount)}`}
        subtitle={
          seatsHaveBuiltInAllowance
            ? "They will be able to consume this amount from the pool after " +
              "reaching their plan usage limit. This limit is added on top of " +
              "each seat's built-in allowance."
            : "This is the total amount of credits each member will be able to " +
              "consume from the workspace credit pool per month."
        }
      />
      <DialogContainer>
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
            {`Personal limit${pluralize(memberCount)} will be removed for ` +
              `${memberCount.toLocaleString("en-US")} member${pluralize(memberCount)}. ` +
              "They will fall back to the workspace default."}
          </p>
        )}
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
          disabled: isSaving || (personalLimitInput === "" && !removeRequested),
          isLoading: isSaving,
          onClick: handleValidate,
        }}
      />
    </>
  );
}
