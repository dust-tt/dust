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
import { useEffect, useRef, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import {
  ProviderAuthNote,
  ProviderSetupInstructions,
} from "@app/components/actions/mcp/provider_setup_instructions";
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
  platform_actions: "Shared account",
  personal_actions: "Personal accounts",
};

export const OAUTH_USE_CASE_TO_DESCRIPTION: Record<MCPOAuthUseCase, string> = {
  platform_actions: "All members will use the credentials you provide here.",
  personal_actions:
    "Each member logs in with their own credentials when they use the tool.",
};

const TOKEN_ENDPOINT_AUTH_METHOD_KEY = "token_endpoint_auth_method" as const;

const TOKEN_ENDPOINT_AUTH_METHOD_OPTIONS = [
  {
    value: "client_secret_post",
    label: "Request body (recommended)",
  },
  {
    value: "client_secret_basic",
    label: "Basic auth header",
  },
] as const;

// Error key used for credential validation errors.
// Parent components can check formState.errors[AUTH_CREDENTIALS_ERROR_KEY].
export const AUTH_CREDENTIALS_ERROR_KEY = "authCredentials" as const;

interface MCPServerOAuthConnexionProps {
  toolName: string;
  // Authorization is always passed as a prop from the parent dialog.
  // It's managed via useState in the dialog (workflow state), not in form state.
  authorization: AuthorizationInfo;
  documentationUrl?: string;
}

export function MCPServerOAuthConnexion({
  toolName,
  authorization,
  documentationUrl,
}: MCPServerOAuthConnexionProps) {
  const { setError, clearErrors, setValue, control } =
    useFormContext<MCPServerOAuthFormValues>();

  const { field: useCaseField } = useController({
    name: "useCase",
    control,
  });

  const { field: authCredentialsField } = useController({
    name: "authCredentials",
    control,
  });

  const useCase = useCaseField.value;
  const authCredentials = authCredentialsField.value;

  // Dynamically fetched credential inputs based on provider and use case.
  const [inputs, setInputs] = useState<OAuthCredentialInputs | null>(null);

  // Track the last initialized provider+useCase to avoid re-initializing on every render.
  const lastInitializedRef = useRef<string | null>(null);

  // Initialize use case and fetch credential inputs.
  // setValue is stable across renders, so no ref tricks needed.
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

    // Skip if we've already initialized for this provider+useCase combination.
    const initKey = `${authorization.provider}:${effectiveUseCase}`;
    if (lastInitializedRef.current === initKey) {
      return;
    }
    lastInitializedRef.current = initKey;

    // Get credential inputs for the selected provider/use case.
    const credentialInputs = getProviderRequiredOAuthCredentialInputs({
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
  }, [authorization, useCase, setValue]);

  // Validate credentials based on dynamic requirements.
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
    authCredentialsField.onChange({ ...(authCredentials ?? {}), [key]: value });
  };

  const handleUseCaseSelect = (selectedUseCase: MCPOAuthUseCase) => {
    useCaseField.onChange(selectedUseCase);
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

      <ProviderSetupInstructions
        provider={authorization.provider}
        useCase={useCase}
      />

      {inputs && (
        <div className="w-full space-y-4 pt-4">
          {Object.entries(inputs).map(([key, inputData]) => {
            if (key === TOKEN_ENDPOINT_AUTH_METHOD_KEY) {
              return null;
            }

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
          {inputs[TOKEN_ENDPOINT_AUTH_METHOD_KEY] && (
            <div className="w-full space-y-2">
              <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
                {inputs[TOKEN_ENDPOINT_AUTH_METHOD_KEY]?.label}
              </Label>
              <div className="grid w-full grid-cols-2 gap-2">
                {TOKEN_ENDPOINT_AUTH_METHOD_OPTIONS.map((option) => {
                  const selected =
                    (authCredentials?.[TOKEN_ENDPOINT_AUTH_METHOD_KEY] ||
                      TOKEN_ENDPOINT_AUTH_METHOD_OPTIONS[0].value) ===
                    option.value;

                  return (
                    <Card
                      key={option.value}
                      variant={selected ? "secondary" : "primary"}
                      selected={selected}
                      className={cn(
                        "cursor-pointer",
                        "px-3 py-2",
                        "text-xs"
                      )}
                      onClick={() =>
                        handleCredentialChange(
                          TOKEN_ENDPOINT_AUTH_METHOD_KEY,
                          option.value
                        )
                      }
                    >
                      <div className="font-medium text-foreground dark:text-foreground-night">
                        {option.label}
                      </div>
                    </Card>
                  );
                })}
              </div>
              {inputs[TOKEN_ENDPOINT_AUTH_METHOD_KEY]?.helpMessage && (
                <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {inputs[TOKEN_ENDPOINT_AUTH_METHOD_KEY]?.helpMessage}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ProviderAuthNote provider={authorization.provider} />

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
