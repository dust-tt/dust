import { CreditLimitInput } from "@app/components/workspace/CreditLimitInput";
import { parseDefaultLimitInput } from "@app/components/workspace/member_spend_limit_helpers";
import { useState } from "react";

// Fetched by the caller since the customer-facing app and poke reach the
// value through different routes. "unavailable" means the workspace has no
// default pool limit at all, so the field is not shown.
export type DefaultUserSpendLimitState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; awuCredits: number };

export type WorkspaceDefaultLimitField = ReturnType<
  typeof useWorkspaceDefaultLimitField
>;

export function useWorkspaceDefaultLimitField({
  defaultUserSpendLimit,
  canEdit,
}: {
  defaultUserSpendLimit: DefaultUserSpendLimitState;
  canEdit: boolean;
}) {
  const loadedAwuCredits =
    defaultUserSpendLimit.status === "ready"
      ? defaultUserSpendLimit.awuCredits
      : undefined;
  // While the workspace default is still loading, block saving instead of
  // treating the unresolved value as unchanged (which would let an admin
  // silently commit whatever ends up in the input once it finally arrives).
  // Viewers who cannot edit it are not held back by its loading state, and a
  // failed fetch only locks this field rather than the whole form.
  const isPending = canEdit && defaultUserSpendLimit.status === "loading";
  const canSubmit = canEdit && loadedAwuCredits !== undefined;

  // The draft stays null until the user types, so the loaded value can show
  // up once fetched without remounting the form (which would drop whatever
  // was typed in the other fields meanwhile).
  const [draft, setDraft] = useState<string | null>(null);
  const value =
    draft ?? (loadedAwuCredits !== undefined ? String(loadedAwuCredits) : "");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  // Returns the new value to save, null when there is nothing to save, or
  // "invalid" after surfacing the error. Only validated when this viewer may
  // change it and the current value is known, so a locked or unloaded field
  // can never block saving the other limits.
  function validate(): number | null | "invalid" {
    if (!canSubmit) {
      setValidationMessage(null);
      return null;
    }
    const result = parseDefaultLimitInput(value);
    if (!result.ok) {
      setValidationMessage(result.message);
      return "invalid";
    }
    setValidationMessage(null);
    return result.awuCredits !== loadedAwuCredits ? result.awuCredits : null;
  }

  return {
    defaultUserSpendLimit,
    value,
    validationMessage,
    isPending,
    canSubmit,
    isChanged: canSubmit && value !== String(loadedAwuCredits),
    validate,
    onChange: (cleaned: string) => {
      setDraft(cleaned);
      setValidationMessage(null);
    },
  };
}

interface WorkspaceDefaultLimitInputProps {
  field: WorkspaceDefaultLimitField;
  readOnlyTooltip?: string;
  isActive: boolean;
}

export function WorkspaceDefaultLimitInput({
  field,
  readOnlyTooltip,
  isActive,
}: WorkspaceDefaultLimitInputProps) {
  return (
    <CreditLimitInput
      label="Workspace default limit"
      value={field.value}
      readOnly={!field.canSubmit}
      readOnlyTooltip={readOnlyTooltip}
      isActive={isActive}
      validationMessage={
        field.defaultUserSpendLimit.status === "error"
          ? "The workspace default limit could not be loaded."
          : field.validationMessage
      }
      onChange={field.onChange}
    />
  );
}
