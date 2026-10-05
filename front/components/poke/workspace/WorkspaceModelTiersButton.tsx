import { WorkspaceLinkCard } from "@app/components/poke/workspace/WorkspaceLinkCard";
import { BarFull } from "@dust-tt/sparkle";

interface WorkspaceModelTiersButtonProps {
  workspaceId: string;
}

export function WorkspaceModelTiersButton({
  workspaceId,
}: WorkspaceModelTiersButtonProps) {
  return (
    <WorkspaceLinkCard
      href={`/poke/${workspaceId}/model-tiers`}
      icon={BarFull}
      title="Model Tiers"
      description="Review the model tier of each member and where it comes from."
    />
  );
}
