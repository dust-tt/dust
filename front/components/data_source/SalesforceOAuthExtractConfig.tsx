import { Input } from "@dust-tt/sparkle";
import { useEffect } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import {
  isValidSalesforceClientId,
  isValidSalesforceClientSecret,
  isValidSalesforceDomain,
} from "@app/types";

export function SalesforceOauthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  useEffect(() => {
    async function generatePKCE() {
      const { code_verifier, code_challenge } = await getPKCEConfig();
      setExtraConfig((extraConfig) => ({
        ...extraConfig,
        code_verifier,
        code_challenge,
      }));
    }

    void generatePKCE();
  }, [extraConfig.instance_url, extraConfig.code_verifier, setExtraConfig]);

  useEffect(() => {
    setIsExtraConfigValid(
      !!extraConfig.instance_url &&
        isValidSalesforceDomain(extraConfig.instance_url) &&
        !!extraConfig.client_id &&
        isValidSalesforceClientId(extraConfig.client_id) &&
        !!extraConfig.client_secret &&
        isValidSalesforceClientSecret(extraConfig.client_secret) &&
        !!extraConfig.code_verifier &&
        !!extraConfig.code_challenge
    );
  }, [extraConfig, setIsExtraConfigValid]);

  const isErrorUrl =
    typeof extraConfig.instance_url === "string" &&
    extraConfig.instance_url.length > 0 &&
    !isValidSalesforceDomain(extraConfig.instance_url);

  return (
    <>
      <Input
        label="Salesforce instance URL"
        message="Must be a valid Salesforce domain in https and ending with .salesforce.com"
        name="instance_url"
        value={extraConfig.instance_url ?? ""}
        placeholder="https://my-org.salesforce.com"
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            instance_url: e.target.value,
          }));
        }}
        messageStatus={isErrorUrl ? "error" : "default"}
      />
      <Input
        label="Client ID"
        message="The client ID from your Salesforce connected app."
        name="client_id"
        value={extraConfig.client_id ?? ""}
        placeholder="3MVG9..."
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            client_id: e.target.value,
          }));
        }}
      />
      <Input
        label="Client Secret"
        message="The client secret from your Salesforce connected app."
        name="client_secret"
        value={extraConfig.client_secret ?? ""}
        placeholder="..."
        type="password"
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            client_secret: e.target.value,
          }));
        }}
      />
    </>
  );
}
