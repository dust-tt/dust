import { AssistantPreview2 } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import type { SyntheticEvent } from "react";

import AssistantListActions from "@app/components/assistant/AssistantListActions";
import { SharingChip } from "@app/components/assistant/Sharing";
import { isLargeModel } from "@app/lib/assistant";
import { isUpgraded } from "@app/lib/plans/plan_codes";

type AssistantPreviewFlow = "personal" | "workspace";

interface GalleryAssistantPreviewContainerProps {
  agentConfiguration: LightAgentConfigurationType;
  flow: AssistantPreviewFlow;
  onShowDetails: () => void;
  onUpdate: () => void;
  owner: WorkspaceType;
  plan: PlanType | null;
  setTestModalAssistant?: (
    agentConfiguration: LightAgentConfigurationType
  ) => void;
}

export function GalleryAssistantPreviewContainer({
  agentConfiguration,
  flow,
  onShowDetails,
  owner,
  plan,
  setTestModalAssistant,
}: GalleryAssistantPreviewContainerProps) {
  const handleTestClick = (e: SyntheticEvent) => {
    e.stopPropagation();
    setTestModalAssistant?.(agentConfiguration);
  };

  const { description, generation, lastAuthors, name, pictureUrl, scope } =
    agentConfiguration;

  const isGlobal = scope === "global";
  const isPersonalFlow = flow === "personal";
  const hasAccessToLargeModels = isUpgraded(plan);
  const eligibleForTesting =
    hasAccessToLargeModels || !isLargeModel(generation?.model);
  const isTestable = !isGlobal && eligibleForTesting;
  return (
    <AssistantPreview2
      title={name}
      pictureUrl={pictureUrl}
      subtitle={lastAuthors?.join(", ") ?? ""}
      description={description}
      variant="gallery"
      onClick={onShowDetails}
      onPlayClick={isTestable ? handleTestClick : undefined}
      renderActions={(isParentHovered) => {
        return (
          <div className="s-flex s-gap-2">
            <SharingChip scope={scope} />
            {isPersonalFlow && (
              <AssistantListActions
                agentConfiguration={agentConfiguration}
                isParentHovered={isParentHovered}
                owner={owner}
              />
            )}
          </div>
        );
      }}
    />
  );
}
