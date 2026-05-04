import { SensitivityLabelsConfig } from "@app/components/shared/labels/SensitivityLabelsConfig";
import type {
  LabelsHandle,
  SensitivityLabelSource,
} from "@app/components/shared/labels/types";
import type { LightWorkspaceType } from "@app/types/user";
import type { Ref } from "react";

interface AdvancedLabelsOptionsProps {
  owner: LightWorkspaceType;
  source: SensitivityLabelSource;
  readOnly?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  labelsRef?: Ref<LabelsHandle>;
}

export const AdvancedLabelsOptions = ({
  owner,
  source,
  readOnly = false,
  onDirtyChange,
  labelsRef,
}: AdvancedLabelsOptionsProps) => {
  return (
    <div className="mt-4">
      <SensitivityLabelsConfig
        owner={owner}
        source={source}
        readOnly={readOnly}
        onDirtyChange={onDirtyChange}
        labelsRef={labelsRef}
      />
    </div>
  );
};
