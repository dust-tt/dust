import { ConnectorSensitivityLabelsConfig } from "@app/components/data_source/SensitivityLabelsConfig";
import type { ConnectorOptionsProps } from "@app/lib/connector_providers_ui";
import {
  useConnectorConfig,
  useTogglePdfEnabled,
} from "@app/lib/swr/connectors";
import {
  ContextItem,
  FilterIcon,
  GooglePdfLogo as GenericPdfLogo,
  SliderToggle,
} from "@dust-tt/sparkle";

/**
 * Creates a connector options component that combines:
 * - PDF syncing toggle
 * - Data classification label filtering
 *
 * Used by the Microsoft connector options.
 */
export const createConnectorOptionsWithLabels = (pdfDescription: string) => {
  const ConnectorOptionsWithLabels = ({
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
                  await togglePdfEnabled(!pdfEnabled);
                }}
                selected={pdfEnabled}
                disabled={readOnly || !isAdmin || isLoading}
              />
            </div>
          }
        >
          <ContextItem.Description>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              {pdfDescription}
            </div>
          </ContextItem.Description>
        </ContextItem>

        <ContextItem
          title="Data Classification Label Filtering"
          visual={<ContextItem.Visual visual={FilterIcon} />}
        >
          <ContextItem.Description>
            <ConnectorSensitivityLabelsConfig
              owner={owner}
              dataSource={dataSource}
              readOnly={readOnly}
              isAdmin={isAdmin}
            />
          </ContextItem.Description>
        </ContextItem>
      </ContextItem.List>
    );
  };

  ConnectorOptionsWithLabels.displayName = "ConnectorOptionsWithLabels";
  return ConnectorOptionsWithLabels;
};
