import {
  Card,
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Hoverable,
  Icon,
  Input,
  Label,
  PlanetIcon,
  Tooltip,
  UserIcon,
} from "@dust-tt/sparkle";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { MCPServerOAuthFormValues } from "@app/components/actions/mcp/forms/types";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import config from "@app/lib/api/config";
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
  const { setError, clearErrors } = useFormContext<MCPServerOAuthFormValues>();

  // Use useController for form fields to get field.onChange for proper lifecycle integration.
  // field.onChange triggers validation and updates dirty/touched states correctly.
  const { field: useCaseField } = useController<
    MCPServerOAuthFormValues,
    "useCase"
  >({
    name: "useCase",
  });
  const useCase = useCaseField.value;

  const { field: credentialsField } = useController<
    MCPServerOAuthFormValues,
    "authCredentials"
  >({
    name: "authCredentials",
  });
  const authCredentials = credentialsField.value;

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
        useCaseField.onChange(effectiveUseCase);
      }
    }

    if (!effectiveUseCase) {
      return;
    }

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
      credentialsField.onChange(nextCredentials);
    }
  }, [authorization, useCaseField, credentialsField, useCase]);

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
    credentialsField.onChange({ ...(authCredentials ?? {}), [key]: value });
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

      {authorization.provider === "snowflake" && <SnowflakeSetupInstructions />}

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

function SnowflakeSetupInstructions() {
  const [isOpen, setIsOpen] = useState(false);

  const redirectUri = `${config.getClientFacingUrl()}/oauth/snowflake/finalize`;

  return (
    <div className="w-full pt-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger hideChevron>
          <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted dark:border-border-night dark:bg-muted-night/50 dark:text-foreground-night dark:hover:bg-muted-night">
            {isOpen ? (
              <ChevronDownIcon className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 shrink-0" />
            )}
            <span>Snowflake Custom OAuth Setup Guide</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3 space-y-4 rounded-lg border border-border bg-background p-4 text-sm dark:border-border-night dark:bg-background-night">
            <p className="text-muted-foreground dark:text-muted-foreground-night">
              Before connecting, you need to create a Custom OAuth Security
              Integration in your Snowflake account. Run the following SQL
              commands as an <strong>ACCOUNTADMIN</strong>:
            </p>

            <div className="space-y-3">
              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  1. Create the OAuth Security Integration:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {`CREATE SECURITY INTEGRATION dust_oauth
  TYPE = OAUTH
  ENABLED = TRUE
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = '${redirectUri}'
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;`}
                </pre>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  2. Get the Client ID and Client Secret:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {`SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('DUST_OAUTH');`}
                </pre>
                <p className="mt-2 text-muted-foreground dark:text-muted-foreground-night">
                  This returns a JSON object with{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    OAUTH_CLIENT_ID
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-muted px-1 dark:bg-muted-night">
                    OAUTH_CLIENT_SECRET
                  </code>
                  . Copy these values into the form below.
                </p>
              </div>

              <div>
                <p className="mb-2 font-medium text-foreground dark:text-foreground-night">
                  3. (Optional) Grant the integration to specific roles:
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs dark:bg-muted-night">
                  {`GRANT USAGE ON INTEGRATION dust_oauth TO ROLE <role_name>;`}
                </pre>
              </div>
            </div>

            <p className="text-muted-foreground dark:text-muted-foreground-night">
              <strong>Note:</strong> The warehouse you specify below will be
              used for all users. The default role can be overridden by
              individual users during their personal authentication.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
