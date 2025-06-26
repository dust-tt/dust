import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type {
  MCPOAuthUseCase,
  OAuthCredentialInputs,
  OAuthCredentials,
} from "@app/types";
import {
  getProviderRequiredOAuthCredentialInputs,
  isSupportedOAuthCredential,
  OAUTH_PROVIDER_NAMES,
} from "@app/types";

export const OAUTH_USE_CASE_TO_LABEL: Record<MCPOAuthUseCase, string> = {
  platform_actions: "Workspace",
  personal_actions: "Personal",
};

type MCPServerOauthConnexionProps = {
  authorization: AuthorizationInfo;
  authCredentials: OAuthCredentials | null;
  useCase: MCPOAuthUseCase | null;
  setUseCase: (useCase: MCPOAuthUseCase) => void;
  setAuthCredentials: (authCredentials: OAuthCredentials) => void;
  setIsFormValid: (isFormValid: boolean) => void;
  documentationUrl?: string;
};

export function MCPServerOAuthConnexion({
  authorization,
  authCredentials,
  useCase,
  setUseCase,
  setAuthCredentials,
  setIsFormValid,
  documentationUrl,
}: MCPServerOauthConnexionProps) {
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
  const [inputs, setInputs] = useState<OAuthCredentialInputs | null>(null);

  useEffect(() => {
    // Pick first choice by default.
    if (authorization.supported_use_cases.length > 0 && !useCase) {
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
        if (!value) {
          isFormValid = false;
          break;
        }
        const input = inputs[key];
        if (input && input.validator && !input.validator(value)) {
          isFormValid = false;
          break;
        }
      }

      setIsFormValid(isFormValid && !!useCase);
    }
  }, [authCredentials, inputs, setIsFormValid, useCase]);

  return (
    <div
      className="flex flex-col items-center gap-2"
      id="mcp-server-oauth-connexion-container"
      ref={setContainerRef}
    >
      {authorization && (
        <>
          {authorization.supported_use_cases.length > 1 && containerRef && (
            <div className="w-full">
              <div className="heading-base">Authentication type</div>
              <div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      isSelect
                      variant="outline"
                      label={
                        useCase
                          ? OAUTH_USE_CASE_TO_LABEL[useCase]
                          : "Select credentials type"
                      }
                      size="sm"
                    />
                  </DropdownMenuTrigger>

                  <DropdownMenuContent mountPortalContainer={containerRef}>
                    {authorization.supported_use_cases.map(
                      (selectableUseCase) => (
                        <DropdownMenuCheckboxItem
                          key={selectableUseCase}
                          checked={selectableUseCase === useCase}
                          onCheckedChange={() => setUseCase(selectableUseCase)}
                        >
                          {OAUTH_USE_CASE_TO_LABEL[selectableUseCase]}
                        </DropdownMenuCheckboxItem>
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
          <div className="w-full text-xs text-muted-foreground dark:text-muted-foreground-night">
            {useCase === "platform_actions" && (
              <>
                The credentials you provide will be shared by all users of these
                tools.
              </>
            )}
            {useCase === "personal_actions" && (
              <>
                Users will connect their own accounts the first time they
                interact with these tools.
              </>
            )}
          </div>
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
                <div key={key} className="w-full">
                  <div className="heading-base">{inputData.label}</div>
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
          {documentationUrl && (
            <div className="w-full text-muted-foreground dark:text-muted-foreground-night">
              Questions ? Read{" "}
              <a
                href={documentationUrl}
                className="font-bold text-highlight-600 dark:text-highlight-600-night"
                target="_blank"
              >
                our guide
              </a>{" "}
              on {OAUTH_PROVIDER_NAMES[authorization.provider]}
            </div>
          )}
        </>
      )}
    </div>
  );
}
