import { AssistantPreview } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  PlanType,
  WorkspaceType,
} from "@dust-tt/types";

import AssistantListActions from "@app/components/assistant/AssistantListActions";
import { SharingChip } from "@app/components/assistant/Sharing";

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
}: GalleryAssistantPreviewContainerProps) {
  const { description, lastAuthors, name, pictureUrl, scope } =
    agentConfiguration;

  return (
    <AssistantPreview
      title={name}
      pictureUrl={pictureUrl}
      subtitle={lastAuthors?.join(", ") ?? ""}
      description={description}
      variant="gallery"
      onClick={onShowDetails}
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
