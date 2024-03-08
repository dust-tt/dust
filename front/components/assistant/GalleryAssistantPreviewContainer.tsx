import { AssistantPreview } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import type { SyntheticEvent } from "react";

import AssistantListActions from "@app/components/assistant/AssistantListActions";
import { SharingChip } from "@app/components/assistant/Sharing";
import { isLargeModel } from "@app/lib/assistant";
import { isUpgraded } from "@app/lib/plans/plan_codes";

interface GalleryAssistantPreviewContainerProps {
  agentConfiguration: LightAgentConfigurationType;
  onShowDetails: () => void;
  onUpdate: () => void;
  owner: WorkspaceType;
  plan: PlanType | null;
}

export function GalleryAssistantPreviewContainer({
  agentConfiguration,
  onShowDetails,
  owner,
  plan,
}: GalleryAssistantPreviewContainerProps) {
  const router = useRouter();

  const handleTestClick = (e: SyntheticEvent) => {
    e.stopPropagation();
    void router.push(
      `/w/${owner.sId}/assistant/new?mention=${agentConfiguration.sId}`
    );
  };

  const { description, generation, lastAuthors, name, pictureUrl, scope } =
    agentConfiguration;

  const hasAccessToLargeModels = isUpgraded(plan);
  const eligibleForTesting =
    hasAccessToLargeModels || !isLargeModel(generation?.model);

  return (
    <AssistantPreview
      title={name}
      pictureUrl={pictureUrl}
      subtitle={lastAuthors?.join(", ") ?? ""}
      description={description}
      variant="gallery"
      onClick={onShowDetails}
      onPlayClick={eligibleForTesting ? handleTestClick : undefined}
      renderActions={(isParentHovered) => {
        return (
          <div className="s-flex s-gap-2">
            <SharingChip scope={scope} />
            <AssistantListActions
              agentConfiguration={agentConfiguration}
              isParentHovered={isParentHovered}
              owner={owner}
            />
          </div>
        );
      }}
    />
  );
}
