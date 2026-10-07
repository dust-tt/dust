import type { ConnectorOptionsProps } from "@app/lib/connector_providers_ui";
import {
  useConnectorConfig,
  useTogglePdfEnabled,
} from "@app/lib/swr/connectors";
import {
  ContextItem,
  GooglePdfLogo as GenericPdfLogo,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";

export const createConnectorOptionsPdfEnabled = (
  description: MessageDescriptor
) => {
  const ConnectorOptionsPdfEnabled = ({
    owner,
    readOnly,
    isAdmin,
    dataSource,
  }: ConnectorOptionsProps) => {
    const { t } = useLingui();
    const { configValue } = useConnectorConfig({
      owner,
      dataSource,
      configKey: "pdfEnabled",
    });
    const pdfEnabled = configValue === "true";

    const { doToggle: togglePdfEnabled, isLoading } = useTogglePdfEnabled({
      dataSource,
      owner,
    });

    const handleSetPdfEnabled = async (pdfEnabled: boolean) => {
      await togglePdfEnabled(pdfEnabled);
    };

    return (
      <ContextItem.List>
        <ContextItem
          title={t`Enable PDF syncing`}
          visual={<ContextItem.Visual visual={GenericPdfLogo} />}
          action={
            <div className="relative">
              <SliderToggle
                onClick={async () => {
                  await handleSetPdfEnabled(!pdfEnabled);
                }}
                selected={pdfEnabled}
                disabled={readOnly || !isAdmin || isLoading}
              />
            </div>
          }
        >
          <ContextItem.Description>
            <div className="text-muted-foreground">{t(description)}</div>
          </ContextItem.Description>
        </ContextItem>
      </ContextItem.List>
    );
  };

  ConnectorOptionsPdfEnabled.displayName = "ConnectorOptionsPdfEnabled";
  return ConnectorOptionsPdfEnabled;
};
