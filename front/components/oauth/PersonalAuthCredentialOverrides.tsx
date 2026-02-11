import { Input, Label } from "@dust-tt/sparkle";

import type { OAuthCredentialInputs } from "@app/types/oauth/lib";
import { isSupportedOAuthCredential } from "@app/types/oauth/lib";

interface PersonalAuthCredentialOverridesProps {
  inputs: OAuthCredentialInputs;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  idPrefix: string;
}

export function PersonalAuthCredentialOverrides({
  inputs,
  values,
  onChange,
  idPrefix,
}: PersonalAuthCredentialOverridesProps) {
  return (
    <div className="flex flex-col gap-4">
      {Object.entries(inputs).map(([key, inputData]) => {
        if (!inputData || !isSupportedOAuthCredential(key)) {
          return null;
        }

        const label = inputData.overridableAtPersonalAuth
          ? inputData.personalAuthLabel
          : inputData.label;
        const helpText = inputData.overridableAtPersonalAuth
          ? inputData.personalAuthHelpMessage
          : inputData.helpMessage;
        const inputId = `personal-auth-override-${idPrefix}-${key}`;
        const value = values[key] ?? "";
        const trimmedValue = value.trim();

        const hasValidationError =
          trimmedValue.length > 0 &&
          inputData.validator &&
          !inputData.validator(trimmedValue);

        const message = hasValidationError
          ? `Invalid ${label.toLowerCase()}. ${helpText ?? "Please check the format."}`
          : helpText;

        return (
          <div key={key} className="flex flex-col gap-1">
            <Label
              htmlFor={inputId}
              className="text-sm font-medium text-foreground dark:text-foreground-night"
            >
              {label}{" "}
              <span className="font-normal text-muted-foreground dark:text-muted-foreground-night">
                (optional)
              </span>
            </Label>
            <Input
              id={inputId}
              name={key}
              placeholder={label}
              value={value}
              onChange={(e) => onChange(key, e.target.value)}
              message={message}
              messageStatus={hasValidationError ? "error" : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

export function areCredentialOverridesValid(
  inputs: OAuthCredentialInputs | null | undefined,
  values: Record<string, string>
): boolean {
  if (!inputs) {
    return true;
  }

  for (const [key, inputData] of Object.entries(inputs)) {
    if (!inputData || !isSupportedOAuthCredential(key)) {
      continue;
    }
    const value = values[key] ?? "";
    const trimmedValue = value.trim();
    if (
      trimmedValue.length > 0 &&
      inputData.validator &&
      !inputData.validator(trimmedValue)
    ) {
      return false;
    }
  }

  return true;
}
