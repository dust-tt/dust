import { Input } from "@dust-tt/sparkle";
import { useEffect } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers_ui";

export function SlackOAuthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  useEffect(() => {
    setIsExtraConfigValid(
      !!extraConfig.client_id &&
        !!extraConfig.client_secret &&
        !!extraConfig.signing_secret
    );
  }, [extraConfig, setIsExtraConfigValid]);

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Slack App Client ID"
        message="The Client ID from your Slack app's, available on the Basic Information page."
        messageStatus="info"
        name="client_id"
        placeholder="1234567890.1234567890123"
        value={extraConfig.client_id ?? ""}
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            client_id: e.target.value,
          }));
        }}
      />
      <Input
        label="Slack App Client Secret"
        message="The Client Secret from your Slack app's, available on the Basic Information page."
        messageStatus="info"
        name="client_secret"
        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        value={extraConfig.client_secret ?? ""}
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            client_secret: e.target.value,
          }));
        }}
      />
      <Input
        label="Slack App Signing Secret"
        message="The Signing Secret from your Slack app's, available on the Basic Information page."
        messageStatus="info"
        name="signing_secret"
        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        value={extraConfig.signing_secret ?? ""}
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            signing_secret: e.target.value,
          }));
        }}
      />
    </div>
  );
}
