import {
  ContentMessage,
  InformationCircleIcon,
  Input,
  Label,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import {
  getProviderRequiredAuthCredentials,
  OAUTH_PROVIDER_NAMES,
} from "@app/types";

type MCPServerOauthConnexionProps = {
  authorization: AuthorizationInfo | null;
  authCredentials: Record<string, string> | null;
  setAuthCredentials: (authCredentials: Record<string, string>) => void;
};

export function MCPServerOAuthConnexion({
  authorization,
  authCredentials,
  setAuthCredentials,
}: MCPServerOauthConnexionProps) {
  const [requiredCredentials, setRequiredCredentials] = useState<Record<
    string,
    { label: string; value: string | number | undefined }
  > | null>(null);

  useEffect(() => {
    const fetchCredentials = async () => {
      const credentials =
        await getProviderRequiredAuthCredentials(authorization);
      setRequiredCredentials(credentials);
      // Set the auth credentials to the values in the credentials object
      // that already have a value as we will not ask the user for these values.
      if (credentials) {
        setAuthCredentials(
          Object.entries(credentials).reduce(
            (acc, [key, { value }]) => ({ ...acc, [key]: value }),
            {}
          )
        );
      }
    };
    void fetchCredentials();
  }, [authorization, setAuthCredentials]);

  return (
    authorization && (
      <div className="flex flex-col items-center gap-2">
        {requiredCredentials ? (
          <>
            <span className="text-500 w-full font-semibold">
              These tools require admin authentication with{" "}
              {OAUTH_PROVIDER_NAMES[authorization.provider]}, we need the
              following information to set them up. Please follow{" "}
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
            {Object.entries(requiredCredentials).map(([key, value]) =>
              requiredCredentials[key].value ? null : (
                <div key={key} className="w-full">
                  <Label htmlFor={key}>{value.label}</Label>
                  <Input
                    id={key}
                    value={authCredentials?.[key] ?? ""}
                    onChange={(e) =>
                      setAuthCredentials({
                        ...authCredentials,
                        [key]: e.target.value,
                      })
                    }
                  />
                </div>
              )
            )}
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
