import {
  Card,
  cn,
  Hoverable,
  Icon,
  Input,
  Label,
  PlanetIcon,
  RadioGroup,
  RadioGroupItem,
  TextArea,
  Tooltip,
  UserIcon,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import type {
  MCPServerConnectionAuthMethod,
  MCPServerOAuthFormValues,
} from "@app/components/actions/mcp/forms/types";
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

// Error key used for credential validation errors.
// Parent components can check formState.errors[AUTH_CREDENTIALS_ERROR_KEY].
export const AUTH_CREDENTIALS_ERROR_KEY = "authCredentials" as const;
export const KEYPAIR_CREDENTIALS_ERROR_KEY = "keyPairCredentials" as const;

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

  const { field: connectionAuthMethodField } = useController({
    name: "connectionAuthMethod",
    control,
  });

  const { field: keyPairCredentialsField } = useController({
    name: "keyPairCredentials",
    control,
  });

  const useCase = useCaseField.value;
  const authCredentials = authCredentialsField.value;
  const connectionAuthMethod = connectionAuthMethodField.value;
  const keyPairCredentials = keyPairCredentialsField.value;

  // Check if the provider supports key pair auth (e.g., Snowflake).
  const supportsKeyPair =
    authorization.auth_methods?.includes("keypair") ?? false;

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

  // Validate OAuth credentials based on dynamic requirements.
  // Runs when credentials or inputs change, uses setError/clearErrors.
  useEffect(() => {
    // Skip OAuth validation if using key pair auth.
    if (connectionAuthMethod === "keypair") {
      clearErrors(AUTH_CREDENTIALS_ERROR_KEY);
      return;
    }

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
  }, [authCredentials, inputs, setError, clearErrors, connectionAuthMethod]);

  // Validate key pair credentials.
  useEffect(() => {
    // Skip key pair validation if using OAuth.
    if (connectionAuthMethod !== "keypair") {
      clearErrors(KEYPAIR_CREDENTIALS_ERROR_KEY);
      return;
    }

    if (!keyPairCredentials) {
      setError(KEYPAIR_CREDENTIALS_ERROR_KEY, {
        type: "manual",
        message: "Key pair credentials required",
      });
      return;
    }

    // Validate required fields for key pair auth.
    const requiredFields = [
      { key: "account", label: "Snowflake Account" },
      { key: "username", label: "Username" },
      { key: "role", label: "Role" },
      { key: "warehouse", label: "Warehouse" },
      { key: "private_key", label: "Private Key" },
    ];

    let errorMessage: string | null = null;
    for (const { key, label } of requiredFields) {
      const value = keyPairCredentials[key as keyof typeof keyPairCredentials];
      if (!value || (typeof value === "string" && value.trim() === "")) {
        errorMessage = `${label} is required`;
        break;
      }
    }

    if (errorMessage) {
      setError(KEYPAIR_CREDENTIALS_ERROR_KEY, {
        type: "manual",
        message: errorMessage,
      });
    } else {
      clearErrors(KEYPAIR_CREDENTIALS_ERROR_KEY);
    }
  }, [keyPairCredentials, connectionAuthMethod, setError, clearErrors]);

  const handleCredentialChange = (key: string, value: string) => {
    if (!isSupportedOAuthCredential(key)) {
      return;
    }
    authCredentialsField.onChange({ ...(authCredentials ?? {}), [key]: value });
  };

  const handleUseCaseSelect = (selectedUseCase: MCPOAuthUseCase) => {
    useCaseField.onChange(selectedUseCase);
  };

  const handleConnectionAuthMethodChange = (
    method: MCPServerConnectionAuthMethod
  ) => {
    connectionAuthMethodField.onChange(method);
    // When switching to key pair, auto-select platform_actions as key pair is for shared accounts.
    if (method === "keypair" && useCase !== "platform_actions") {
      useCaseField.onChange("platform_actions");
    }
  };

  const handleKeyPairCredentialChange = (
    key: keyof NonNullable<MCPServerOAuthFormValues["keyPairCredentials"]>,
    value: string
  ) => {
    const defaults = {
      auth_type: "keypair" as const,
      account: "",
      username: "",
      role: "",
      warehouse: "",
      private_key: "",
      private_key_passphrase: "",
    };
    keyPairCredentialsField.onChange({
      ...defaults,
      ...keyPairCredentials,
      [key]: value,
    });
  };

  const supportsPersonalActions =
    authorization.supported_use_cases.includes("personal_actions");
  const supportsPlatformActions =
    authorization.supported_use_cases.includes("platform_actions");
  const supportsBoth = supportsPersonalActions && supportsPlatformActions;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Auth method selector - only shown for providers that support both OAuth and key pair */}
      {supportsKeyPair && (
        <div className="w-full space-y-4">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Authentication method
          </div>
          <RadioGroup
            name="connectionAuthMethod"
            value={connectionAuthMethod}
            onValueChange={(value: string) =>
              handleConnectionAuthMethodChange(
                value as MCPServerConnectionAuthMethod
              )
            }
          >
            <div className="space-y-1">
              <RadioGroupItem value="oauth" label="OAuth (recommended)" />
              <p className="ml-6 text-sm text-muted-foreground dark:text-muted-foreground-night">
                Users authenticate with their own Snowflake accounts
              </p>
            </div>
            <div className="space-y-1">
              <RadioGroupItem
                value="keypair"
                label="Key Pair Authentication (service account)"
              />
              <p className="ml-6 text-sm text-muted-foreground dark:text-muted-foreground-night">
                All users share a service account with key pair auth
              </p>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Use case selection - hidden when key pair is selected (always platform_actions) */}
      {connectionAuthMethod !== "keypair" && (
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
      )}

      {/* Key pair credentials form */}
      {connectionAuthMethod === "keypair" && (
        <div className="w-full space-y-4 pt-4">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Service Account Credentials
          </div>
          <Input
            label="Snowflake Account"
            name="account"
            value={keyPairCredentials?.account ?? ""}
            placeholder="abc123.us-east-1 or myorg-myaccount"
            onChange={(e) =>
              handleKeyPairCredentialChange("account", e.target.value)
            }
            message="Your Snowflake account identifier"
          />
          <Input
            label="Username"
            name="username"
            value={keyPairCredentials?.username ?? ""}
            placeholder="SERVICE_USER"
            onChange={(e) =>
              handleKeyPairCredentialChange("username", e.target.value)
            }
            message="The Snowflake user configured with the RSA public key"
          />
          <Input
            label="Role"
            name="role"
            value={keyPairCredentials?.role ?? ""}
            placeholder="ANALYST"
            onChange={(e) =>
              handleKeyPairCredentialChange("role", e.target.value)
            }
            message="The Snowflake role for all users"
          />
          <Input
            label="Warehouse"
            name="warehouse"
            value={keyPairCredentials?.warehouse ?? ""}
            placeholder="COMPUTE_WH"
            onChange={(e) =>
              handleKeyPairCredentialChange("warehouse", e.target.value)
            }
            message="The warehouse to use for queries"
          />
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Private Key (PEM format)
            </Label>
            <TextArea
              name="private_key"
              value={keyPairCredentials?.private_key ?? ""}
              placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
              rows={8}
              onChange={(e) =>
                handleKeyPairCredentialChange("private_key", e.target.value)
              }
            />
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Paste your RSA private key in PEM format
            </p>
          </div>
          <Input
            label="Private Key Passphrase (optional)"
            name="private_key_passphrase"
            type="password"
            value={keyPairCredentials?.private_key_passphrase ?? ""}
            placeholder="Leave empty if key is not encrypted"
            onChange={(e) =>
              handleKeyPairCredentialChange(
                "private_key_passphrase",
                e.target.value
              )
            }
            message="If your private key is encrypted, enter the passphrase"
          />
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            <p className="mb-2">To use key-pair authentication:</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Generate an RSA key pair (minimum 2048 bits)</li>
              <li>Register the public key with your Snowflake user</li>
              <li>Paste the private key above in PEM format</li>
            </ol>
          </div>
        </div>
      )}

      {/* OAuth setup instructions and credentials - only for OAuth method */}
      {connectionAuthMethod !== "keypair" && (
        <>
          <ProviderSetupInstructions
            provider={authorization.provider}
            useCase={useCase}
          />

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
                      onChange={(e) =>
                        handleCredentialChange(key, e.target.value)
                      }
                      message={inputData.helpMessage}
                      messageStatus={hasValidationError ? "error" : undefined}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <ProviderAuthNote provider={authorization.provider} />
        </>
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
