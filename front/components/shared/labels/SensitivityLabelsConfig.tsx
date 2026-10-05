import type { LightWorkspaceType } from "@app/types/user";
import { MicrosoftLabelsSelector } from "./MicrosoftLabelsSelector";
import type { SensitivityLabelsController } from "./types";

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
