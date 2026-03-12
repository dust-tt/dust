import type { CreateMCPServerDialogFormValues } from "@app/components/actions/mcp/forms/types";
import type { RemoteMCPServerOAuthConfigComponentProps } from "@app/components/actions/mcp/remote_mcp_oauth_config_registry";
import { isValidClientIdOrSecret } from "@app/types/oauth/lib";
import { Input, Label } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";
import { useController, useFormContext } from "react-hook-form";

const BOX_AUTHORIZATION_ENDPOINT =
  "https://account.box.com/api/oauth2/authorize";
const BOX_TOKEN_ENDPOINT = "https://api.box.com/oauth2/token";

/**
 * Box.com remote MCP OAuth config: only Client ID and Client Secret.
 * MCP URL, token URL, and authorization URL are hardcoded; scopes are configured server-side on Box.
 */
export function BoxOAuthConfig({
  defaultServerConfig: _defaultServerConfig,
  onValidityChange,
}: RemoteMCPServerOAuthConfigComponentProps) {
  const { control } = useFormContext<CreateMCPServerDialogFormValues>();
  const { field: authCredentialsField } = useController({
    name: "authCredentials",
    control,
  });
  const authCredentials = authCredentialsField.value ?? {};
  const lastValidRef = useRef<boolean | null>(null);

  // Ensure hardcoded endpoints are always present in authCredentials for submit.
  useEffect(() => {
    const current = authCredentialsField.value ?? {};
    if (
      current.authorization_endpoint !== BOX_AUTHORIZATION_ENDPOINT ||
      current.token_endpoint !== BOX_TOKEN_ENDPOINT
    ) {
      authCredentialsField.onChange({
        authorization_endpoint: BOX_AUTHORIZATION_ENDPOINT,
        token_endpoint: BOX_TOKEN_ENDPOINT,
        ...current,
      });
    }
  }, [authCredentialsField]);

  const clientId = authCredentials.client_id ?? "";
  const clientSecret = authCredentials.client_secret ?? "";
  const isValid =
    isValidClientIdOrSecret(clientId) && isValidClientIdOrSecret(clientSecret);

  useEffect(() => {
    if (lastValidRef.current !== isValid) {
      lastValidRef.current = isValid;
      onValidityChange(isValid);
    }
  }, [isValid, onValidityChange]);

  const updateCredentials = (updates: Partial<Record<string, string>>) => {
    const next = {
      authorization_endpoint: BOX_AUTHORIZATION_ENDPOINT,
      token_endpoint: BOX_TOKEN_ENDPOINT,
      ...authCredentials,
      ...updates,
    };
    authCredentialsField.onChange(next);
  };

  return (
    <div className="w-full space-y-4 pt-4">
      <div className="space-y-2">
        <Label
          htmlFor="box-client-id"
          className="text-sm font-semibold text-foreground dark:text-foreground-night"
        >
          OAuth Client ID
        </Label>
        <Input
          id="box-client-id"
          value={clientId}
          onChange={(e) => updateCredentials({ client_id: e.target.value })}
          placeholder="From your Box Developer Console app"
          messageStatus={
            clientId.length > 0 && !isValidClientIdOrSecret(clientId)
              ? "error"
              : undefined
          }
        />
      </div>
      <div className="space-y-2">
        <Label
          htmlFor="box-client-secret"
          className="text-sm font-semibold text-foreground dark:text-foreground-night"
        >
          OAuth Client Secret
        </Label>
        <Input
          id="box-client-secret"
          type="password"
          value={clientSecret}
          onChange={(e) => updateCredentials({ client_secret: e.target.value })}
          placeholder="From your Box Developer Console app"
          messageStatus={
            clientSecret.length > 0 && !isValidClientIdOrSecret(clientSecret)
              ? "error"
              : undefined
          }
        />
      </div>
      <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
        OAuth URLs are fixed for Box. Scopes are configured in your Box app
        settings.
      </p>
    </div>
  );
}
