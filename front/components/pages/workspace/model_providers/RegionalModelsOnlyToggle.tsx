import { RegionalFlag } from "@app/components/shared/RegionalFlag";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useCellContext } from "@app/lib/auth/CellContext";
import { useUpdateWorkspaceRegionalModelsOnly } from "@app/lib/swr/workspaces";
import type { RegionType } from "@app/types/region";
import type { LightWorkspaceType } from "@app/types/user";
import { ContextItem, SliderToggle } from "@dust-tt/sparkle";

interface RegionalModelsOnlyToggleConfig {
  label: string;
  description: string;
  icon: React.ReactNode;
}

const REGIONAL_MODELS_ONLY_TOGGLE_CONFIG: Record<
  RegionType,
  RegionalModelsOnlyToggleConfig | null
> = {
  "europe-west1": {
    label: "EU-hosted models only",
    description:
      "Limit available models to EU-based ones. Useful for data residency requirements.",
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
  const { cellInfo } = useCellContext();
  const {
    updateWorkspaceRegionalModelsOnly,
    isUpdatingWorkspaceRegionalModelsOnly,
  } = useUpdateWorkspaceRegionalModelsOnly({ owner: workspace });
  const { hasFeature } = useFeatureFlags();

  if (!hasFeature("use_vertex_for_supported_models")) {
    return <></>;
  }

  const config = REGIONAL_MODELS_ONLY_TOGGLE_CONFIG[cellInfo.region];

  if (!config) {
    return null;
  }

  return (
    <ContextItem
      title={config.label}
      visual={config.icon}
      hasSeparator={false}
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
    >
      <ContextItem.Description>
        <span className="text-sm text-muted-foreground">
          {config.description}
        </span>
      </ContextItem.Description>
    </ContextItem>
  );
}
