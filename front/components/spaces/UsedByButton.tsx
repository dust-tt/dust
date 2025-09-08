import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RobotIcon,
} from "@dust-tt/sparkle";

import type { AgentsUsageType } from "@app/types";

export const UsedByButton = ({
  usage,
  onItemClick,
}: {
  usage: AgentsUsageType | null;
  onItemClick: (assistantSid: string) => void;
}) => {
  return !usage || usage.count === 0 ? (
    <Button
      icon={RobotIcon}
      variant="ghost-secondary"
      isSelect={false}
      size="xs"
      label="0"
      disabled
    />
  ) : (
    // 1. modal={false} to make the dropdown menu non-modal and avoid a timing issue when we open the Agent side-panel modal.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          icon={RobotIcon}
          variant="ghost-secondary"
          isSelect={true}
          size="xs"
          label={`${usage.count}`}
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            // 2. Avoid propagating the click to the parent element.
            e.stopPropagation();
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-48">
        {usage.agents.map((agent) => (
          <DropdownMenuItem
            key={`assistant-picker-${agent.sId}`}
            label={agent.name}
            onClick={(e) => {
              e.stopPropagation();
              onItemClick(agent.sId);
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
