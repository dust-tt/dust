import { WorkspaceLinkCard } from "@app/components/poke/workspace/WorkspaceLinkCard";
import { CoinsStacked01 } from "@dust-tt/sparkle";

interface WorkspacePoolUsageButtonProps {
  workspaceId: string;
}

export function WorkspacePoolUsageButton({
  workspaceId,
}: WorkspacePoolUsageButtonProps) {
  return (
    <WorkspaceLinkCard
      href={`/poke/${workspaceId}/pool-usage`}
      icon={CoinsStacked01}
      title="Credits Usage"
      description="Review member seats and credit pool consumption."
    />
  );
}
