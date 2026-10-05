import { CreditLimitInput } from "@app/components/workspace/CreditLimitInput";
import { parseDefaultLimitInput } from "@app/components/workspace/member_spend_limit_helpers";
import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const loadedAwuCredits =
    defaultUserSpendLimit.status === "ready"
      ? defaultUserSpendLimit.awuCredits
      : undefined;
  const isPending = canEdit && defaultUserSpendLimit.status === "loading";
  const canSubmit = canEdit && loadedAwuCredits !== undefined;
  const [draft, setDraft] = useState<string | null>(null);
  const value =
    draft ?? (loadedAwuCredits !== undefined ? String(loadedAwuCredits) : "");
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  function validate(): number | null | "invalid" {
    if (!canSubmit) {
      setValidationMessage(null);
      return null;
    }
    const result = parseDefaultLimitInput(value);
    if (!result.ok) {
      setValidationMessage(t(result.message));
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
  const { t } = useLingui();
  return (
    <CreditLimitInput
      label={t`Workspace default limit`}
      value={field.value}
      readOnly={!field.canSubmit}
      readOnlyTooltip={readOnlyTooltip}
      isActive={isActive}
      validationMessage={
        field.defaultUserSpendLimit.status === "error"
          ? t`The workspace default limit could not be loaded.`
          : field.validationMessage
      }
      onChange={field.onChange}
    />
  );
}
