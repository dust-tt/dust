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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={RobotIcon}
          variant="ghost-secondary"
          isSelect={true}
          size="xs"
          label={`${usage.count}`}
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
