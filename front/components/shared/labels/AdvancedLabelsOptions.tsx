import { SensitivityLabelsConfig } from "@app/components/shared/labels/SensitivityLabelsConfig";
import type { SensitivityLabelSource } from "@app/components/shared/labels/types";
import type { LightWorkspaceType } from "@app/types/user";

interface AdvancedLabelsOptionsProps {
  owner: LightWorkspaceType;
  source: SensitivityLabelSource;
  readOnly?: boolean;
}

export const AdvancedLabelsOptions = ({
  owner,
  source,
  readOnly = false,
}: AdvancedLabelsOptionsProps) => {
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
        source={source}
        readOnly={readOnly}
      />
    </div>
  );
};
