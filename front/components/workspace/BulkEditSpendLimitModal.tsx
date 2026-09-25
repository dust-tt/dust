import { BulkMembersModalHeader } from "@app/components/workspace/BulkMembersModalHeader";
import { CreditLimitInput } from "@app/components/workspace/CreditLimitInput";
import {
  parseCreditsInput,
  toSpendLimit,
} from "@app/components/workspace/member_spend_limit_helpers";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
} from "@dust-tt/sparkle";
import { useState } from "react";

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
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* Without this, the dialog auto-focuses the avatar stack's tooltip
          trigger, which opens the members tooltip as soon as it appears. */}
      <DialogContent
        size="md"
        className="font-sans"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isOpen && (
          <BulkEditSpendLimitForm
            onClose={onClose}
            memberCount={memberCount}
            selectedMembers={selectedMembers}
            seatsHaveBuiltInAllowance={seatsHaveBuiltInAllowance}
            onValidate={onValidate}
          />
        )}
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
      // An empty field removes the personal limit, falling back to the
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
        title={`Edit personal limit for ${memberCount.toLocaleString("en-US")} members`}
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
        <CreditLimitInput
          label="Personal limit"
          value={personalLimitInput}
          readOnly={false}
          isActive={false}
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
          disabled: isSaving,
          isLoading: isSaving,
          onClick: handleValidate,
        }}
      />
    </>
  );
}
