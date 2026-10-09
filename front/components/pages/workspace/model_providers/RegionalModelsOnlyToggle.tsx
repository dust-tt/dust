import { RegionalFlag } from "@app/components/shared/RegionalFlag";
import { useRunsOnRegionalHosting } from "@app/hooks/useRunsOnRegionalHosting";
import { useCellContext } from "@app/lib/auth/CellContext";
import { useUpdateWorkspaceRegionalModelsOnly } from "@app/lib/swr/workspaces";
import type { RegionType } from "@app/types/region";
import type { LightWorkspaceType } from "@app/types/user";
import { SettingsList, SliderToggle } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

interface RegionalModelsOnlyToggleConfig {
  label: MessageDescriptor;
  description: MessageDescriptor;
  icon: React.ReactNode;
}

const REGIONAL_MODELS_ONLY_TOGGLE_CONFIG: Record<
  RegionType,
  RegionalModelsOnlyToggleConfig | null
> = {
  "europe-west1": {
    label: msg`EU-hosted models only`,
    description: msg`Limit available models to EU-based ones. Useful for data residency requirements.`,
    icon: <RegionalFlag region="europe-west1" size={32} />,
  },
  "us-central1": null,
};

interface RegionalModelsOnlyToggleProps {
  workspace: LightWorkspaceType;
}

export function RegionalModelsOnlyToggle({
  workspace,
}: RegionalModelsOnlyToggleProps) {
  const { t } = useLingui();
  const { cellInfo } = useCellContext();
  const {
    updateWorkspaceRegionalModelsOnly,
    isUpdatingWorkspaceRegionalModelsOnly,
  } = useUpdateWorkspaceRegionalModelsOnly({ owner: workspace });
  const runsOnRegionalHosting = useRunsOnRegionalHosting();

  if (!runsOnRegionalHosting) {
    return null;
  }

  const config = REGIONAL_MODELS_ONLY_TOGGLE_CONFIG[cellInfo.region];

  if (!config) {
    return null;
  }

  return (
    <SettingsList.Row
      icon={config.icon}
      title={t(config.label)}
      description={t(config.description)}
      action={
        <SliderToggle
          selected={workspace.regionalModelsOnly}
          disabled={isUpdatingWorkspaceRegionalModelsOnly}
          onClick={() => {
            void updateWorkspaceRegionalModelsOnly(
              !workspace.regionalModelsOnly
            );
          }}
        />
      }
    />
  );
}
