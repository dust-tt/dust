import { Input } from "@dust-tt/sparkle";
import { useEffect } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers";
import {
  SlackClientIdSchema,
  SlackCredentialsStrictSchema,
  SlackSecretSchema,
} from "@app/types";

export function SlackOAuthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  useEffect(() => {
    setIsExtraConfigValid(
      SlackCredentialsStrictSchema.safeParse(extraConfig).success
    );
  }, [extraConfig, setIsExtraConfigValid]);

  const isErrorClientId =
    typeof extraConfig.client_id === "string" &&
    extraConfig.client_id.length > 0 &&
    !SlackClientIdSchema.safeParse(extraConfig.client_id).success;

  const isErrorClientSecret =
    typeof extraConfig.client_secret === "string" &&
    extraConfig.client_secret.length > 0 &&
    !SlackSecretSchema.safeParse(extraConfig.client_secret).success;

  const isErrorSigningSecret =
    typeof extraConfig.signing_secret === "string" &&
    extraConfig.signing_secret.length > 0 &&
    !SlackSecretSchema.safeParse(extraConfig.signing_secret).success;

  return (
    <>
      <Input
        label="Client ID"
        message={
          isErrorClientId
            ? "Invalid format. Client ID must be two groups of digits separated by a dot (e.g., 1234567890.0987654321)."
            : "Find this in your Slack app settings under 'App Credentials'."
        }
        name="client_id"
        value={extraConfig.client_id ?? ""}
        placeholder="1234567890.0987654321"
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            client_id: e.target.value,
          }));
        }}
        messageStatus={isErrorClientId ? "error" : "default"}
      />
      <Input
        label="Client Secret"
        message={
          isErrorClientSecret
            ? "Invalid format. Client Secret must be exactly 32 hexadecimal characters (0-9, a-f)."
            : "Find this in your Slack app settings under 'App Credentials'."
        }
        name="client_secret"
        value={extraConfig.client_secret ?? ""}
        placeholder="a1b2c3..."
        type="password"
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            client_secret: e.target.value,
          }));
        }}
        messageStatus={isErrorClientSecret ? "error" : "default"}
      />
      <Input
        label="Signing Secret"
        message={
          isErrorSigningSecret
            ? "Invalid format. Signing Secret must be exactly 32 hexadecimal characters (0-9, a-f)."
            : "Find this in your Slack app settings under 'App Credentials'."
        }
        name="signing_secret"
        value={extraConfig.signing_secret ?? ""}
        placeholder="d4e5f6..."
        type="password"
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            signing_secret: e.target.value,
          }));
        }}
        messageStatus={isErrorSigningSecret ? "error" : "default"}
      />
    </>
  );
}
