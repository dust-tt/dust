import { Input } from "@dust-tt/sparkle";
import { isValidZendeskSubdomain } from "@dust-tt/types";
import { useEffect } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers";

export function ZendeskOAuthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  useEffect(() => {
    setIsExtraConfigValid(
      isValidZendeskSubdomain(extraConfig.zendesk_subdomain)
    );
  }, [extraConfig, setIsExtraConfigValid]);

  return (
    <Input
      label="Zendesk account subdomain"
      message="The first part of your Zendesk account URL."
      messageStatus="info"
      name="subdomain"
      placeholder="my-subdomain"
      onChange={(e) => {
        setExtraConfig({ zendesk_subdomain: e.target.value });
      }}
    />
  );
}
