import { ContextItem, MicrosoftLogo, SliderToggle } from "@dust-tt/sparkle";

import type { ConnectorOptionsProps } from "@app/lib/connector_providers";
import {
  useConnectorConfig,
  useTogglePdfEnabled,
} from "@app/lib/swr/connectors";

export function MicrosoftPdfEnabled({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: ConnectorOptionsProps) {
  const { configValue } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "pdfEnabled",
  });
  const pdfEnabled = configValue === "true";

  const { doToggle: togglePdfEnabled, isLoading: loading } =
    useTogglePdfEnabled({ dataSource, owner });

  const handleSetPdfEnabled = async (pdfEnabled: boolean) => {
    await togglePdfEnabled(pdfEnabled);
  };

  return (
    <ContextItem.List>
      <ContextItem
        title="Enable PDF syncing"
        visual={<ContextItem.Visual visual={MicrosoftLogo} />}
        action={
          <div className="relative">
            <SliderToggle
              size="xs"
              onClick={async () => {
                await handleSetPdfEnabled(!pdfEnabled);
              }}
              selected={pdfEnabled}
              disabled={readOnly || !isAdmin || loading}
            />
          </div>
        }
      >
        <ContextItem.Description>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            When enabled, PDF documents from your Microsoft OneDrive and
            SharePoint will be synced and processed by Dust.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
