import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Input,
  Modal,
  Page,
} from "@dust-tt/sparkle";
import { isValidZendeskSubdomain } from "@dust-tt/types";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
  const [isLoading, setIsLoading] = useState(false);
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});

  const isExtraConfigValid = useCallback(() => {
    if (connectorProviderConfiguration.connectorProvider === "zendesk") {
      return isValidZendeskSubdomain(extraConfig.zendesk_subdomain);
    } else {
      return true;
    }
  }, [connectorProviderConfiguration.connectorProvider, extraConfig]);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
      // Clean-up extraConfig at mount since the component is reused across providers.
      setExtraConfig({});
    }
  }, [isOpen, setIsLoading]);

  return (
    <Modal
      isOpen={isOpen}
      title="Connection Setup"
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="pt-8">
        <Page.Vertical gap="lg" align="stretch">
          <Page.Header
            title={`Connecting ${connectorProviderConfiguration.name}`}
            icon={connectorProviderConfiguration.logoComponent}
          />
          <a
            href={connectorProviderConfiguration.guideLink ?? ""}
            target="_blank"
          >
            <Button
              label="Read our guide"
              size="xs"
              variant="outline"
              icon={BookOpenIcon}
            />
          </a>
          {connectorProviderConfiguration.connectorProvider ===
            "google_drive" && (
            <>
              <div className="flex flex-col gap-y-2">
                <div className="grow text-sm font-medium text-element-800">
                  Disclosure
                </div>
                <div className="text-sm font-normal text-element-700">
                  Dust's use of information received from the Google APIs will
                  adhere to{" "}
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
                  within your Google Drive, the data contained in the files and
                  folders that you choose to synchronize with Dust will be
                  transmitted to third-party entities, including but not limited
                  to Artificial Intelligence (AI) model providers, for the
                  purpose of processing and analysis. This process is an
                  integral part of the functionality of our service and is
                  subject to the terms outlined in our Privacy Policy and Terms
                  of Service.
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

          {connectorProviderConfiguration.connectorProvider === "zendesk" && (
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

          <div className="flex justify-center pt-2">
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="md"
                icon={CloudArrowLeftRightIcon}
                onClick={() => {
                  setIsLoading(true);
                  onConfirm(extraConfig);
                }}
                disabled={!isExtraConfigValid() || isLoading}
                label={
                  isLoading
                    ? "Connecting..."
                    : connectorProviderConfiguration.connectorProvider ===
                        "google_drive"
                      ? "Acknowledge and Connect"
                      : "Connect"
                }
              />
            </div>
          </div>
        </Page.Vertical>
      </div>
    </Modal>
  );
}
