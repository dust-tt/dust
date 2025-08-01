import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RobotIcon,
} from "@dust-tt/sparkle";

import type { DataSourceWithAgentsUsageType } from "@app/types";

export const UsedByButton = ({
  usage,
  onItemClick,
}: {
  usage: DataSourceWithAgentsUsageType;
  onItemClick: (assistantSid: string) => void;
}) => {
  return usage.count === 0 ? (
    <Button
      icon={RobotIcon}
      variant="ghost-secondary"
      isSelect={false}
      size="xs"
      label={`${usage.count}`}
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
