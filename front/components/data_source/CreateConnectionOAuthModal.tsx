import type { ConnectorProviderConfiguration } from "@app/lib/connector_providers";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import {
  BookOpen01,
  Button,
  CloudArrowLeftRight,
  Hoverable,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

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
  const { t } = useLingui();
  const [isLoading, setIsLoading] = useState(false);
  const [extraConfig, setExtraConfig] = useState<Record<string, string>>({});
  const [isExtraConfigValid, setIsExtraConfigValid] = useState(true);

  const connectorUIConfiguration =
    CONNECTOR_UI_CONFIGURATIONS[
      connectorProviderConfiguration.connectorProvider
    ];

  const providerName = connectorProviderConfiguration.name;

  useEffect(() => {
    if (isOpen) {
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
          <SheetTitle>
            <Trans>Connection setup</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="pt-8">
            <Page.Vertical gap="lg" align="stretch">
              <Page.Header title={t`Connecting ${providerName}`} />
              <Button
                label={t`Read our guide`}
                size="xs"
                variant="outline"
                href={connectorUIConfiguration.guideLink ?? ""}
                target="_blank"
                icon={BookOpen01}
              />
              {connectorProviderConfiguration.connectorProvider ===
                "google_drive" && (
                <>
                  <div className="flex flex-col gap-y-2">
                    <div className="copy-sm grow text-muted-foreground">
                      <strong>
                        <Trans>Disclosure</Trans>
                      </strong>
                    </div>
                    <div className="copy-sm font-normal text-muted-foreground">
                      <Trans>
                        Dust's use of information received from the Google APIs
                        will adhere to{" "}
                        <Hoverable
                          variant="highlight"
                          href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
                        >
                          Google API Services User Data Policy
                        </Hoverable>
                        , including the Limited Use requirements.
                      </Trans>
                    </div>
                  </div>

                  <div className="flex flex-col gap-y-2">
                    <div className="copy-sm grow font-medium text-muted-foreground">
                      <Trans>Notice on data processing</Trans>
                    </div>
                    <div className="copy-sm font-normal text-muted-foreground">
                      <Trans>
                        By connecting Google Drive, you acknowledge and agree
                        that within your Google Drive, the data contained in the
                        files and folders that you choose to synchronize with
                        Dust will be transmitted to third-party entities,
                        including but not limited to Artificial Intelligence
                        (AI) model providers, for the purpose of processing and
                        analysis. This process is an integral part of the
                        functionality of our service and is subject to the terms
                        outlined in our Privacy Policy and Terms of Service.
                      </Trans>
                    </div>
                  </div>
                </>
              )}

              {connectorUIConfiguration.limitations && (
                <div className="flex flex-col gap-y-2">
                  <div className="copy-sm grow font-medium text-muted-foreground">
                    <Trans>Limitations</Trans>
                  </div>
                  <div className="copy-sm font-normal text-muted-foreground">
                    {t(connectorUIConfiguration.limitations)}
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
                    icon={CloudArrowLeftRight}
                    onClick={() => {
                      setIsLoading(true);
                      onConfirm(extraConfig);
                    }}
                    disabled={!isExtraConfigValid || isLoading}
                    label={
                      isLoading
                        ? t`Connecting...`
                        : connectorProviderConfiguration.connectorProvider ===
                            "google_drive"
                          ? t`Acknowledge and connect`
                          : t`Connect`
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
