import { Input } from "@dust-tt/sparkle";
import { useEffect } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers";

export function SlackOAuthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  useEffect(() => {
    setIsExtraConfigValid(
      !!extraConfig.slack_client_id &&
        !!extraConfig.slack_client_secret &&
        !!extraConfig.slack_signing_secret
    );
  }, [extraConfig, setIsExtraConfigValid]);

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Slack App Client ID"
        message="The Client ID from your Slack app's, available on the Basic Information page."
        messageStatus="info"
        name="slack_client_id"
        placeholder="1234567890.1234567890123"
        value={extraConfig.slack_client_id ?? ""}
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            slack_client_id: e.target.value,
          }));
        }}
      />
      <Input
        label="Slack App Client Secret"
        message="The Client Secret from your Slack app's, available on the Basic Information page."
        messageStatus="info"
        name="slack_client_secret"
        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        value={extraConfig.slack_client_secret ?? ""}
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            slack_client_secret: e.target.value,
          }));
        }}
      />
      <Input
        label="Slack App Signing Secret"
        message="The Signing Secret from your Slack app's, available on the Basic Information page."
        messageStatus="info"
        name="slack_signing_secret"
        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        value={extraConfig.slack_signing_secret ?? ""}
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            slack_signing_secret: e.target.value,
          }));
        }}
      />
    </div>
  );
}
