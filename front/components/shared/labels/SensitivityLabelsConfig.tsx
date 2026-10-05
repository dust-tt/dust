import type { SensitivityLabelsController } from "./types";
import type { LightWorkspaceType } from "@app/types/user";
import { MicrosoftLabelsSelector } from "./MicrosoftLabelsSelector";

interface SensitivityLabelsConfigProps {
  owner: LightWorkspaceType;
  controller: SensitivityLabelsController;
  readOnly?: boolean;
}

export function SensitivityLabelsConfig({
  owner,
  controller,
  readOnly = false,
}: SensitivityLabelsConfigProps) {
  return (
    <MicrosoftLabelsSelector
      owner={owner}
      controller={controller}
      readOnly={readOnly}
    />
  );
}
