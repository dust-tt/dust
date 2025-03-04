import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Input,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import {
  isValidSalesforceClientId,
  isValidSalesforceClientSecret,
  isValidSalesforceDomain,
  isValidZendeskSubdomain,
} from "@dust-tt/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";

type CreateConnectionConfirmationModalProps = {
  connectorProviderConfiguration: ConnectorProviderConfiguration;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (extraConfig: Record<string, string>) => void;
};

export function CreateConnectionConfirmationModal({
  connectorProviderConfiguration,
  isOpen,
  onClose,
  onConfirm,
}: CreateConnectionConfirmationModalProps) {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});
  const [pkceLoadingStatus, setPkceLoadingStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");

  const isExtraConfigValid = useCallback(
    (extraConfig: Record<string, string>) => {
      if (connectorProviderConfiguration.connectorProvider === "zendesk") {
        return isValidZendeskSubdomain(extraConfig.zendesk_subdomain);
      } else if (
        connectorProviderConfiguration.connectorProvider === "salesforce"
      ) {
        return (
          !!extraConfig.instance_url &&
          isValidSalesforceDomain(extraConfig.instance_url) &&
          !!extraConfig.client_id &&
          isValidSalesforceClientId(extraConfig.client_id) &&
          !!extraConfig.client_secret &&
          isValidSalesforceClientSecret(extraConfig.client_secret) &&
          !!extraConfig.code_verifier &&
          !!extraConfig.code_challenge
        );
      } else {
        return true;
      }
    },
    [connectorProviderConfiguration.connectorProvider]
  );

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
      // Clean-up extraConfig at mount since the component is reused across providers.
      setExtraConfig({});
    }
  }, [isOpen, setIsLoading]);

  useEffect(() => {
    async function generatePKCE() {
      if (
        connectorProviderConfiguration.connectorProvider === "salesforce" &&
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
    connectorProviderConfiguration.connectorProvider,
    extraConfig.instance_url,
    extraConfig.code_verifier,
    pkceLoadingStatus,
  ]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Connection Setup</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="pt-8">
            <Page.Vertical gap="lg" align="stretch">
              <Page.Header
                title={`Connecting ${connectorProviderConfiguration.name}`}
                icon={connectorProviderConfiguration.getLogoComponent(isDark)}
              />
              <Button
                label="Read our guide"
                size="xs"
                variant="outline"
                href={connectorProviderConfiguration.guideLink ?? ""}
                target="_blank"
                icon={BookOpenIcon}
              />
              {connectorProviderConfiguration.connectorProvider ===
                "google_drive" && (
                <>
                  <div className="flex flex-col gap-y-2">
                    <div className="grow text-sm font-medium text-element-800">
                      Disclosure
                    </div>
                    <div className="text-sm font-normal text-element-700">
                      Dust's use of information received from the Google APIs
                      will adhere to{" "}
                      <Link
                        className="text-action-500"
                        href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                      >
                        Google API Services User Data Policy
                      </Link>
                      , including the Limited Use requirements.
                    </div>
                  </div>

                  <div className="flex flex-col gap-y-2">
                    <div className="grow text-sm font-medium text-element-800">
                      Notice on data processing
                    </div>
                    <div className="text-sm font-normal text-element-700">
                      By connecting Google Drive, you acknowledge and agree that
                      within your Google Drive, the data contained in the files
                      and folders that you choose to synchronize with Dust will
                      be transmitted to third-party entities, including but not
                      limited to Artificial Intelligence (AI) model providers,
                      for the purpose of processing and analysis. This process
                      is an integral part of the functionality of our service
                      and is subject to the terms outlined in our Privacy Policy
                      and Terms of Service.
                    </div>
                  </div>
                </>
              )}

              {connectorProviderConfiguration.limitations && (
                <div className="flex flex-col gap-y-2">
                  <div className="grow text-sm font-medium text-element-800">
                    Limitations
                  </div>
                  <div className="text-sm font-normal text-element-700">
                    {connectorProviderConfiguration.limitations}
                  </div>
                </div>
              )}

              {connectorProviderConfiguration.connectorProvider ===
                "zendesk" && (
                <Input
                  label="Zendesk account subdomain"
                  message="The first part of your Zendesk account URL."
                  messageStatus="info"
                  name="subdomain"
                  value={extraConfig.zendesk_subdomain ?? ""}
                  placeholder="my-subdomain"
                  onChange={(e) => {
                    setExtraConfig({ zendesk_subdomain: e.target.value });
                  }}
                />
              )}

              {connectorProviderConfiguration.connectorProvider ===
                "salesforce" && (
                <>
                  <Input
                    label="Salesforce instance URL"
                    message="The URL of your Salesforce organization instance."
                    name="instance_url"
                    value={extraConfig.instance_url ?? ""}
                    placeholder="https://my-org.salesforce.com"
                    onChange={(e) => {
                      setExtraConfig((prev) => ({
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
                      setExtraConfig((prev) => ({
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
                      setExtraConfig((prev) => ({
                        ...prev,
                        client_secret: e.target.value,
                      }));
                    }}
                  />
                </>
              )}

              <div className="flex justify-center pt-2">
                <div className="flex gap-2">
                  <Button
                    variant="highlight"
                    size="md"
                    icon={CloudArrowLeftRightIcon}
                    onClick={() => {
                      setIsLoading(true);
                      onConfirm(extraConfig);
                    }}
                    disabled={!isExtraConfigValid(extraConfig) || isLoading}
                    label={
                      isLoading
                        ? "Connecting..."
                        : connectorProviderConfiguration.connectorProvider ===
                            "google_drive"
                          ? "Acknowledge and connect"
                          : "Connect"
                    }
                  />
                </div>
              </div>
            </Page.Vertical>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
