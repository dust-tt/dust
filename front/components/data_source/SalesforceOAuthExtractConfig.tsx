import { Input } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers";
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
  const [pkceStatus, setPkceStatus] = useState<{
    url: string;
    status: "success" | "loading" | "error" | "idle";
  }>({
    url: "",
    status: "idle",
  });

  useEffect(() => {
    async function generatePKCE() {
      try {
        setPkceStatus({
          url: extraConfig.instance_url,
          status: "loading",
        });
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
        setPkceStatus({
          url: extraConfig.instance_url,
          status: "success",
        });
      } catch (error) {
        console.error("Error generating PKCE challenge:", error);
        setPkceStatus({
          url: extraConfig.instance_url,
          status: "error",
        });
      }
    }

    if (
      isValidSalesforceDomain(extraConfig.instance_url) &&
      pkceStatus.url !== extraConfig.instance_url
    ) {
      void generatePKCE();
    }
  }, [
    extraConfig.instance_url,
    extraConfig.code_verifier,
    pkceStatus,
    setExtraConfig,
    setPkceStatus,
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

  const isErrorUrl =
    typeof extraConfig.instance_url === "string" &&
    extraConfig.instance_url.length > 0 &&
    !isValidSalesforceDomain(extraConfig.instance_url);

  const isPkceError = pkceStatus.status === "error";

  return (
    <>
      <Input
        label="Salesforce instance URL"
        message={
          isPkceError
            ? "Error loading Salesforce OAuth credentials. Check if your url is correct and try again or contact us at support@dust.tt."
            : "Must be a valid Salesforce domain in https and ending with .salesforce.com or .force.com"
        }
        name="instance_url"
        value={extraConfig.instance_url ?? ""}
        placeholder="https://my-org.salesforce.com"
        onChange={(e) => {
          setExtraConfig((prev: Record<string, string>) => ({
            ...prev,
            instance_url: e.target.value,
          }));
        }}
        messageStatus={isErrorUrl || isPkceError ? "error" : "default"}
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
