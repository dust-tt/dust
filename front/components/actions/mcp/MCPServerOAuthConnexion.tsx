import {
  ContentMessage,
  InformationCircleIcon,
  Input,
  Label,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { OAuthCredentialInputs, OAuthCredentials } from "@app/types";
import {
  getProviderRequiredOAuthCredentialInputs,
  isSupportedOAuthCredential,
  OAUTH_PROVIDER_NAMES,
} from "@app/types";

type MCPServerOauthConnexionProps = {
  authorization: AuthorizationInfo | null;
  authCredentials: OAuthCredentials | null;
  setAuthCredentials: (authCredentials: OAuthCredentials) => void;
  setIsFormValid: (isFormValid: boolean) => void;
};

export function MCPServerOAuthConnexion({
  authorization,
  authCredentials,
  setAuthCredentials,
  setIsFormValid,
}: MCPServerOauthConnexionProps) {
  const [inputs, setInputs] = useState<OAuthCredentialInputs | null>(null);

  // We fetch the credential inputs for this provider and use case.
  useEffect(() => {
    const fetchCredentialInputs = async () => {
      const credentialInputs =
        await getProviderRequiredOAuthCredentialInputs(authorization);
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
  }, [authorization, setAuthCredentials]);

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
      setIsFormValid(isFormValid);
    }
  }, [authCredentials, inputs, setIsFormValid]);

  return (
    authorization && (
      <div className="flex flex-col items-center gap-2">
        {inputs ? (
          <>
            <span className="text-500 w-full font-semibold">
              These tools require admin authentication with{" "}
              {OAUTH_PROVIDER_NAMES[authorization.provider]}. Please follow{" "}
              <a
                href="https://docs.dust.tt/docs/salesforce"
                className="text-highlight-600"
                target="_blank"
              >
                this guide
              </a>{" "}
              to learn how to set up a Salesforce app to get the Client ID and
              Client Secret.
            </span>
            {Object.entries(inputs).map(([key, inputData]) => {
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
                  <Label htmlFor={key}>{inputData.label}</Label>
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
          </>
        ) : (
          <Label className="self-start">
            These tools require authentication with{" "}
            {OAUTH_PROVIDER_NAMES[authorization.provider]}.
          </Label>
        )}

        <div className="w-full pt-4">
          {authorization.use_case === "platform_actions" && (
            <ContentMessage
              size="md"
              variant="warning"
              title="These tools are using workspace level credentials."
              icon={InformationCircleIcon}
            >
              Authentication credentials will be shared by all users of this
              workspace when they use these tools.
            </ContentMessage>
          )}
          {authorization.use_case === "personal_actions" && (
            <ContentMessage
              size="md"
              variant="highlight"
              title="These tools are using personal level credentials."
              icon={InformationCircleIcon}
            >
              Once setup for the workspace, each user will have to connect their
              own {OAUTH_PROVIDER_NAMES[authorization.provider]} credentials to
              interact with these tools.
            </ContentMessage>
          )}
        </div>
      </div>
    )
  );
}
