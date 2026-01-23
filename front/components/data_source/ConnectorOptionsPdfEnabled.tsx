import { ContextItem, SliderToggle } from "@dust-tt/sparkle";
import { GooglePdfLogo as GenericPdfLogo } from "@dust-tt/sparkle";

import type { ConnectorOptionsProps } from "@app/lib/connector_providers_ui";
import {
  useConnectorConfig,
  useTogglePdfEnabled,
} from "@app/lib/swr/connectors";

export const createConnectorOptionsPdfEnabled = (description: string) => {
  const ConnectorOptionsPdfEnabled = ({
    owner,
    readOnly,
    isAdmin,
    dataSource,
  }: ConnectorOptionsProps) => {
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
          title="Enable PDF syncing"
          visual={<ContextItem.Visual visual={GenericPdfLogo} />}
          action={
            <div className="relative">
              <SliderToggle
                size="xs"
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
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              {description}
            </div>
          </ContextItem.Description>
        </ContextItem>
      </ContextItem.List>
    );
  };

  ConnectorOptionsPdfEnabled.displayName = "ConnectorOptionsPdfEnabled";
  return ConnectorOptionsPdfEnabled;
};
