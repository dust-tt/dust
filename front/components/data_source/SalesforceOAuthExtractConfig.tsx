import { Input } from "@dust-tt/sparkle";
import {
  isValidSalesforceClientId,
  isValidSalesforceClientSecret,
  isValidSalesforceDomain,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers";

export function SalesforceOauthExtraConfig({
  extraConfig,
  setExtraConfig,
  setIsExtraConfigValid,
}: ConnectorOauthExtraConfigProps) {
  const [pkceLoadingStatus, setPkceLoadingStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");

  useEffect(() => {
    async function generatePKCE() {
      if (
        isValidSalesforceDomain(extraConfig.instance_url) &&
        !extraConfig.code_verifier &&
        pkceLoadingStatus === "idle"
      ) {
        setPkceLoadingStatus("loading");
        try {
          const response = await fetch(
            `/api/oauth/pkce?domain=${extraConfig.instance_url}`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );
          if (!response.ok) {
            throw new Error("Failed to generate PKCE challenge");
          }
          const { code_verifier, code_challenge } = await response.json();
          setExtraConfig((extraConfig) => ({
            ...extraConfig,
            code_verifier,
            code_challenge,
          }));
          setPkceLoadingStatus("idle");
        } catch (error) {
          console.error("Error generating PKCE challenge:", error);
          setPkceLoadingStatus("error");
        }
      }
    }

    void generatePKCE();
  }, [
    extraConfig.instance_url,
    extraConfig.code_verifier,
    pkceLoadingStatus,
    setExtraConfig,
    setPkceLoadingStatus,
  ]);

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

  return (
    <>
      <Input
        label="Salesforce instance URL"
        message="The URL of your Salesforce organization instance."
        name="instance_url"
        value={extraConfig.instance_url ?? ""}
        placeholder="https://my-org.salesforce.com"
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            instance_url: e.target.value,
          }));
        }}
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
