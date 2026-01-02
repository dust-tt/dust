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

type MCPServerOauthConnexionProps = {
  toolName: string;
  authorization: AuthorizationInfo;
  authCredentials: OAuthCredentials | null;
  useCase: MCPOAuthUseCase | null;
  setUseCase: (useCase: MCPOAuthUseCase) => void;
  setAuthCredentials: (authCredentials: OAuthCredentials) => void;
  setIsFormValid: (isFormValid: boolean) => void;
  documentationUrl?: string;
};

export function MCPServerOAuthConnexion({
  toolName,
  authorization,
  authCredentials,
  useCase,
  setUseCase,
  setAuthCredentials,
  setIsFormValid,
  documentationUrl,
}: MCPServerOauthConnexionProps) {
  const [inputs, setInputs] = useState<OAuthCredentialInputs | null>(null);

  useEffect(() => {
    if (useCase) {
      return;
    }
    if (authorization.supported_use_cases.includes("personal_actions")) {
      setUseCase("personal_actions");
    } else if (authorization.supported_use_cases.length > 0) {
      setUseCase(authorization.supported_use_cases[0]);
    }
  }, [authorization.supported_use_cases, setUseCase, useCase]);

  useEffect(() => {
    if (useCase) {
      // We fetch the credential inputs for this provider and use case.
      const fetchCredentialInputs = async () => {
        const credentialInputs = await getProviderRequiredOAuthCredentialInputs(
          {
            provider: authorization.provider,
            useCase: useCase,
          }
        );
        setInputs(credentialInputs);

        // Set the auth credentials to the values in the credentials object
        // that already have a value as we will not ask the user for these values.
        if (credentialInputs) {
          setAuthCredentials(
            Object.entries(credentialInputs).reduce(
              (acc, [key, { value }]) => ({ ...acc, [key]: value }),
              {}
            )
          );
        }
      };
      void fetchCredentialInputs();
    }
  }, [authorization.provider, setAuthCredentials, useCase]);

  // We check if the form is valid.
  useEffect(() => {
    if (inputs && authCredentials) {
      let isFormValid = true;
      for (const [key, value] of Object.entries(authCredentials)) {
        if (!isSupportedOAuthCredential(key)) {
          // Can't happen but to make typescript happy.
          continue;
        }

        const input = inputs[key];
        if (input && input.validator) {
          if (!input.validator(value)) {
            isFormValid = false;
            break;
          }
        } else {
          if (!value) {
            isFormValid = false;
            break;
          }
        }
      }

      setIsFormValid(isFormValid && !!useCase);
    }
  }, [authCredentials, inputs, setIsFormValid, useCase]);

  const supportsPersonalActions =
    authorization.supported_use_cases.includes("personal_actions");
  const supportsPlatformActions =
    authorization.supported_use_cases.includes("platform_actions");
  const supportBoth = supportsPersonalActions && supportsPlatformActions;

  return (
    <div className="flex flex-col items-center gap-4">
      <>
        <div className="w-full space-y-4">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            {supportBoth ? "How do you want to connect?" : "Connection type"}
          </div>
          <div className="grid w-full grid-cols-2 gap-4">
            <ConditionalTooltip
              showTooltip={!supportsPersonalActions}
              label={`${toolName} does not support individual connection.`}
            >
              <Card
                variant={supportsPersonalActions ? "secondary" : "primary"}
                selected={useCase === "personal_actions"}
                disabled={!supportsPersonalActions}
                className={cn(
                  "h-full",
                  supportsPersonalActions
                    ? "cursor-pointer"
                    : "cursor-not-allowed"
                )}
                onClick={
                  supportsPersonalActions
                    ? () => setUseCase("personal_actions")
                    : undefined
                }
              >
                <div className="flex flex-col gap-1 p-1">
                  <div className="flex items-center gap-2">
                    <Icon
                      visual={UserIcon}
                      className={cn(
                        supportsPersonalActions
                          ? "text-highlight"
                          : "text-muted-foreground dark:text-muted-foreground-night"
                      )}
                    />
                    <span
                      className={cn(
                        "font-medium",
                        supportsPersonalActions
                          ? "text-highlight"
                          : "text-muted-foreground dark:text-muted-foreground-night"
                      )}
                    >
                      {OAUTH_USE_CASE_TO_LABEL["personal_actions"]}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {OAUTH_USE_CASE_TO_DESCRIPTION["personal_actions"]}
                  </span>
                </div>
              </Card>
            </ConditionalTooltip>
            <ConditionalTooltip
              showTooltip={!supportsPlatformActions}
              label={`${toolName} does not support shared connection.`}
            >
              <Card
                variant={supportsPlatformActions ? "secondary" : "primary"}
                selected={useCase === "platform_actions"}
                disabled={!supportsPlatformActions}
                className={cn(
                  "h-full",
                  supportsPlatformActions
                    ? "cursor-pointer"
                    : "cursor-not-allowed"
                )}
                onClick={
                  supportsPlatformActions
                    ? () => setUseCase("platform_actions")
                    : undefined
                }
              >
                <div className="flex flex-col gap-1 p-1">
                  <div className="flex items-center gap-2">
                    <Icon
                      visual={PlanetIcon}
                      className={cn(
                        supportsPlatformActions
                          ? "text-highlight"
                          : "text-muted-foreground dark:text-muted-foreground-night"
                      )}
                    />
                    <span
                      className={cn(
                        "font-medium",
                        supportsPlatformActions
                          ? "text-highlight"
                          : "text-muted-foreground dark:text-muted-foreground-night"
                      )}
                    >
                      {OAUTH_USE_CASE_TO_LABEL["platform_actions"]}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {OAUTH_USE_CASE_TO_DESCRIPTION["platform_actions"]}
                  </span>
                </div>
              </Card>
            </ConditionalTooltip>
          </div>
        </div>

        {inputs && (
          <div className="w-full space-y-4 pt-4">
            {inputs &&
              Object.entries(inputs).map(([key, inputData]) => {
                if (inputData.value) {
                  // If the credential is already set, we don't need to ask the user for it.
                  return null;
                }

                if (!isSupportedOAuthCredential(key)) {
                  // Can't happen but to make typescript happy.
                  return null;
                }

                const value = authCredentials?.[key] ?? "";
                return (
                  <div key={key} className="w-full space-y-1">
                    <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      {inputData.label}
                    </Label>
                    <Input
                      id={key}
                      value={value}
                      onChange={(e) =>
                        setAuthCredentials({
                          ...authCredentials,
                          [key]: e.target.value,
                        })
                      }
                      message={inputData.helpMessage}
                      messageStatus={
                        value.length > 0 &&
                        inputData.validator &&
                        !inputData.validator(value)
                          ? "error"
                          : undefined
                      }
                    />
                  </div>
                );
              })}
          </div>
        )}

        {documentationUrl && (
          <div className="w-full pt-6 text-sm text-muted-foreground dark:text-muted-foreground-night">
            Questions ? Read{" "}
            <Hoverable
              href={documentationUrl}
              target="_blank"
              variant="primary"
            >
              our guide
            </Hoverable>{" "}
            on {toolName}.
          </div>
        )}
      </>
    </div>
  );
}

function ConditionalTooltip({
  showTooltip,
  label,
  children,
}: {
  showTooltip: boolean;
  label: string;
  children: React.ReactElement;
}) {
  if (showTooltip) {
    return <Tooltip label={label} trigger={children} tooltipTriggerAsChild />;
  }
  return children;
}
