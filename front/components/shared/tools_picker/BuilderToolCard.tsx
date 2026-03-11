import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { useActionDisplay } from "@app/components/shared/tools_picker/useActionDisplay";
import type { ActionCardDiffStatus } from "@dust-tt/sparkle";
import { ActionCard } from "@dust-tt/sparkle";

interface BuilderToolCardProps {
  action: BuilderAction;
  onClick?: () => void;
  onRemove?: () => void;
  diffStatus?: ActionCardDiffStatus;
}

export function BuilderToolCard({
  action,
  onClick,
  onRemove,
  diffStatus,
}: BuilderToolCardProps) {
  const { icon, displayName, description } = useActionDisplay(action);

  const commonProps = {
    icon,
    label: displayName,
    description,
    canAdd: false as const,
    onClick,
    onRemove,
    cardContainerClassName: "h-28",
  };

  if (diffStatus) {
    return <ActionCard {...commonProps} diffStatus={diffStatus} />;
  }

  return <ActionCard {...commonProps} />;
}
