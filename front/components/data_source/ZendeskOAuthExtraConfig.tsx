import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers_ui";
import { isValidZendeskSubdomain } from "@app/types/oauth/lib";
import { Input } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

export function ZendeskOAuthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  const { t } = useLingui();
  useEffect(() => {
    setIsExtraConfigValid(
      isValidZendeskSubdomain(extraConfig.zendesk_subdomain)
    );
  }, [extraConfig, setIsExtraConfigValid]);

  return (
    <Input
      label={t`Zendesk account subdomain`}
      message={t`The first part of your Zendesk account URL.`}
      messageStatus="info"
      name="subdomain"
      placeholder="my-subdomain"
      onChange={(e) => {
        setExtraConfig({ zendesk_subdomain: e.target.value });
      }}
    />
  );
}
