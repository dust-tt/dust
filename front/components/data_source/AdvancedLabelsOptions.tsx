import { SensitivityLabelsConfig } from "@app/components/shared/labels/SensitivityLabelsConfig";
import type { ConnectorOptionsProps } from "@app/lib/connector_providers_ui";

export const AdvancedLabelsOptions = ({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: ConnectorOptionsProps) => {
  return (
    <div className="flex flex-col gap-2 mt-4">
      <span className="heading-sm text-foreground dark:text-foreground-night">
        Allowed labels
      </span>
      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
        Only labeled content matching one of these labels will be synced.
        Unlabeled content is always included.
      </span>
      <SensitivityLabelsConfig
        owner={owner}
        source={{ dataSourceId: dataSource.sId }}
        readOnly={readOnly}
        isAdmin={isAdmin}
      />
    </div>
  );
};
