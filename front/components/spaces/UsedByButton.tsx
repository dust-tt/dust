import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  RobotIcon,
  ScrollArea,
} from "@dust-tt/sparkle";
import type { DataSourceWithAgentsUsageType } from "@dust-tt/types";

export const UsedByButton = ({
  usage,
  onItemClick,
}: {
  usage: DataSourceWithAgentsUsageType;
  onItemClick: (assistantSid: string) => void;
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={RobotIcon}
          variant="ghost"
          isSelect
          size="sm"
          label={`${usage.count}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[300px]">
        <ScrollArea className="border-1 max-h-[300px]">
          {usage.agentNames.map((name) => (
            <DropdownMenuItem
              key={`assistant-picker-${name}`}
              label={name}
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(name);
              }}
            />
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
