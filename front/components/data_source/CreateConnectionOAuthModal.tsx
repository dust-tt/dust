import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Hoverable,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";

type CreateConnectionOAuthModalProps = {
  connectorProviderConfiguration: ConnectorProviderConfiguration;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (extraConfig: Record<string, string>) => void;
};

export function CreateConnectionOAuthModal({
  connectorProviderConfiguration,
  isOpen,
  onClose,
  onConfirm,
}: CreateConnectionOAuthModalProps) {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});
  const [isExtraConfigValid, setIsExtraConfigValid] = useState(true);

  const connectorUIConfiguration =
    CONNECTOR_UI_CONFIGURATIONS[
      connectorProviderConfiguration.connectorProvider
    ];

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
      // Clean-up extraConfig at mount since the component is reused across providers.
      setExtraConfig({});
    }
  }, [isOpen, setIsLoading]);

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
                icon={connectorUIConfiguration.getLogoComponent(isDark)}
              />
              <Button
                label="Read our guide"
                size="xs"
                variant="outline"
                href={connectorUIConfiguration.guideLink ?? ""}
                target="_blank"
                icon={BookOpenIcon}
              />
              {connectorProviderConfiguration.connectorProvider ===
                "google_drive" && (
                <>
                  <div className="flex flex-col gap-y-2">
                    <div className="copy-sm grow text-muted-foreground dark:text-muted-foreground-night">
                      <strong>Disclosure</strong>
                    </div>
                    <div className="copy-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                      Dust's use of information received from the Google APIs
                      will adhere to{" "}
                      <Hoverable
                        variant="highlight"
                        href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                      >
                        Google API Services User Data Policy
                      </Hoverable>
                      , including the Limited Use requirements.
                    </div>
                  </div>

                  <div className="flex flex-col gap-y-2">
                    <div className="copy-sm grow font-medium text-muted-foreground dark:text-muted-foreground-night">
                      Notice on data processing
                    </div>
                    <div className="copy-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
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

              {connectorUIConfiguration.limitations && (
                <div className="flex flex-col gap-y-2">
                  <div className="copy-sm grow font-medium text-muted-foreground dark:text-muted-foreground-night">
                    Limitations
                  </div>
                  <div className="copy-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                    {connectorUIConfiguration.limitations}
                  </div>
                </div>
              )}

              {connectorUIConfiguration.oauthExtraConfigComponent && (
                <connectorUIConfiguration.oauthExtraConfigComponent
                  extraConfig={extraConfig}
                  setExtraConfig={setExtraConfig}
                  setIsExtraConfigValid={setIsExtraConfigValid}
                />
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
                    disabled={!isExtraConfigValid || isLoading}
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
