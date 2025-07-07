import { ContextItem, GooglePdfLogo, SliderToggle } from "@dust-tt/sparkle";

import {
  useConnectorConfig,
  useTogglePdfEnabled,
} from "@app/lib/swr/connectors";
import type { DataSourceType, WorkspaceType } from "@app/types";

export function GoogleDrivePdfEnabled({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
}) {
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
        visual={<ContextItem.Visual visual={GooglePdfLogo} />}
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
            When enabled, PDF documents from your Google Drive will be synced
            and processed by Dust.
          </div>
        </ContextItem.Description>
      </ContextItem>
    </ContextItem.List>
  );
}
