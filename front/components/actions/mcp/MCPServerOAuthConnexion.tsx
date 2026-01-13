import {
  Card,
  cn,
  Hoverable,
  Icon,
  Input,
  Label,
  PlanetIcon,
  Tooltip,
  UserIcon,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type {
  MCPOAuthUseCase,
  OAuthCredentialInputs,
  OAuthCredentials,
} from "@app/types";
import {
  getProviderRequiredOAuthCredentialInputs,
  isSupportedOAuthCredential,
} from "@app/types";

export const OAUTH_USE_CASE_TO_LABEL: Record<MCPOAuthUseCase, string> = {
  platform_actions: "Shared",
  personal_actions: "Individual",
};

export const OAUTH_USE_CASE_TO_DESCRIPTION: Record<MCPOAuthUseCase, string> = {
  platform_actions: "All members use the credentials you provide now.",
  personal_actions: "Each member connects their own account.",
};

// Error key used for credential validation errors.
// Parent components can check formState.errors[AUTH_CREDENTIALS_ERROR_KEY].
export const AUTH_CREDENTIALS_ERROR_KEY = "authCredentials" as const;

interface MCPServerOAuthConnexionProps {
  toolName: string;
  authorization: AuthorizationInfo;
  documentationUrl?: string;
}

export function MCPServerOAuthConnexion({
  toolName,
  authorization,
  documentationUrl,
}: MCPServerOAuthConnexionProps) {
  const { setValue, setError, clearErrors } =
    useFormContext<MCPServerOAuthFormValues>();

  const useCase = useWatch<MCPServerOAuthFormValues, "useCase">({
    name: "useCase",
  });
  const authCredentials = useWatch<MCPServerOAuthFormValues, "authCredentials">(
    { name: "authCredentials" }
  );

  // Dynamically fetched credential inputs based on provider and use case.
  const [inputs, setInputs] = useState<OAuthCredentialInputs | null>(null);

  // Effect 1: Initialize use case and fetch credential inputs.
  // Handles both auto-selecting a default use case and fetching credentials when it changes.
  useEffect(() => {
    let effectiveUseCase = useCase;

    // Auto-select default use case if not already set.
    if (!effectiveUseCase) {
      if (authorization.supported_use_cases.includes("personal_actions")) {
        effectiveUseCase = "personal_actions";
      } else if (authorization.supported_use_cases.length > 0) {
        effectiveUseCase = authorization.supported_use_cases[0];
      }
      if (effectiveUseCase) {
        setValue("useCase", effectiveUseCase);
      }
    }

    if (!effectiveUseCase) {
      return;
    }

    // Fetch credential inputs for the selected provider/use case.
    const fetchCredentialInputs = async () => {
      const credentialInputs = await getProviderRequiredOAuthCredentialInputs({
        provider: authorization.provider,
        useCase: effectiveUseCase,
      });
      setInputs(credentialInputs);

      // Pre-populate credentials with default values from the provider.
      if (credentialInputs) {
        const nextCredentials: OAuthCredentials = {};
        for (const [key, inputData] of Object.entries(credentialInputs)) {
          if (isSupportedOAuthCredential(key)) {
            nextCredentials[key] = inputData.value ?? "";
          }
        }
        setValue("authCredentials", nextCredentials);
      }
    };

    void fetchCredentialInputs();
  }, [
    authorization.supported_use_cases,
    authorization.provider,
    setValue,
    useCase,
  ]);

  // Effect 2: Validate credentials based on dynamic requirements.
  // Runs when credentials or inputs change, uses setError/clearErrors.
  useEffect(() => {
    if (!inputs) {
      clearErrors(AUTH_CREDENTIALS_ERROR_KEY);
      return;
    }

    if (!authCredentials) {
      setError(AUTH_CREDENTIALS_ERROR_KEY, {
        type: "manual",
        message: "Credentials required",
      });
      return;
    }

    // Find first invalid credential.
    let errorMessage: string | null = null;
    for (const [key, inputData] of Object.entries(inputs)) {
      if (!isSupportedOAuthCredential(key) || inputData.value) {
        continue; // Skip unsupported or pre-filled values.
      }

      const value = authCredentials[key] ?? "";
      if (inputData.validator) {
        if (!inputData.validator(value)) {
          errorMessage = `Invalid ${inputData.label}`;
          break;
        }
      } else if (!value) {
        errorMessage = `${inputData.label} is required`;
        break;
      }
    }

    if (errorMessage) {
      setError(AUTH_CREDENTIALS_ERROR_KEY, {
        type: "manual",
        message: errorMessage,
      });
    } else {
      clearErrors(AUTH_CREDENTIALS_ERROR_KEY);
    }
  }, [authCredentials, inputs, setError, clearErrors]);

  const handleCredentialChange = (key: string, value: string) => {
    if (!isSupportedOAuthCredential(key)) {
      return;
    }
    setValue("authCredentials", { ...(authCredentials ?? {}), [key]: value });
  };

  const handleUseCaseSelect = (selectedUseCase: MCPOAuthUseCase) => {
    setValue("useCase", selectedUseCase);
  };

  const supportsPersonalActions =
    authorization.supported_use_cases.includes("personal_actions");
  const supportsPlatformActions =
    authorization.supported_use_cases.includes("platform_actions");
  const supportsBoth = supportsPersonalActions && supportsPlatformActions;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full space-y-4">
        <div className="heading-lg text-foreground dark:text-foreground-night">
          {supportsBoth ? "How do you want to connect?" : "Connection type"}
        </div>
        <div className="grid w-full grid-cols-2 gap-4">
          <UseCaseCard
            useCaseType="personal_actions"
            isSelected={useCase === "personal_actions"}
            isSupported={supportsPersonalActions}
            toolName={toolName}
            onSelect={handleUseCaseSelect}
          />
          <UseCaseCard
            useCaseType="platform_actions"
            isSelected={useCase === "platform_actions"}
            isSupported={supportsPlatformActions}
            toolName={toolName}
            onSelect={handleUseCaseSelect}
          />
        </div>
      </div>

      {inputs && (
        <div className="w-full space-y-4 pt-4">
          {Object.entries(inputs).map(([key, inputData]) => {
            if (inputData.value || !isSupportedOAuthCredential(key)) {
              return null; // Skip pre-filled or unsupported credentials.
            }

            const value = authCredentials?.[key] ?? "";
            const hasValidationError =
              value.length > 0 &&
              inputData.validator &&
              !inputData.validator(value);

            return (
              <div key={key} className="w-full space-y-1">
                <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
                  {inputData.label}
                </Label>
                <Input
                  id={key}
                  value={value}
                  onChange={(e) => handleCredentialChange(key, e.target.value)}
                  message={inputData.helpMessage}
                  messageStatus={hasValidationError ? "error" : undefined}
                />
              </div>
            );
          })}
        </div>
      )}

      {documentationUrl && (
        <div className="w-full pt-6 text-sm text-muted-foreground dark:text-muted-foreground-night">
          Questions ? Read{" "}
          <Hoverable href={documentationUrl} target="_blank" variant="primary">
            our guide
          </Hoverable>{" "}
          on {toolName}.
        </div>
      )}
    </div>
  );
}

interface UseCaseCardProps {
  useCaseType: MCPOAuthUseCase;
  isSelected: boolean;
  isSupported: boolean;
  toolName: string;
  onSelect: (useCase: MCPOAuthUseCase) => void;
}

function UseCaseCard({
  useCaseType,
  isSelected,
  isSupported,
  toolName,
  onSelect,
}: UseCaseCardProps) {
  const icon = useCaseType === "personal_actions" ? UserIcon : PlanetIcon;
  const supportLabel =
    useCaseType === "personal_actions" ? "individual" : "shared";

  const card = (
    <Card
      variant={isSupported ? "secondary" : "primary"}
      selected={isSelected}
      disabled={!isSupported}
      className={cn(
        "h-full",
        isSupported ? "cursor-pointer" : "cursor-not-allowed"
      )}
      onClick={isSupported ? () => onSelect(useCaseType) : undefined}
    >
      <div className="flex flex-col gap-1 p-1">
        <div className="flex items-center gap-2">
          <Icon
            visual={icon}
            className={cn(
              isSupported
                ? "text-highlight"
                : "text-muted-foreground dark:text-muted-foreground-night"
            )}
          />
          <span
            className={cn(
              "font-medium",
              isSupported
                ? "text-highlight"
                : "text-muted-foreground dark:text-muted-foreground-night"
            )}
          >
            {OAUTH_USE_CASE_TO_LABEL[useCaseType]}
          </span>
        </div>
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {OAUTH_USE_CASE_TO_DESCRIPTION[useCaseType]}
        </span>
      </div>
    </Card>
  );

  if (!isSupported) {
    return (
      <Tooltip
        label={`${toolName} does not support ${supportLabel} connection.`}
        trigger={card}
        tooltipTriggerAsChild
      />
    );
  }

  return card;
}
