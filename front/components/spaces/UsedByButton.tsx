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
import { pluralize } from "@dust-tt/types";

export const UsedByButton = ({
  usage,
  onItemClick,
}: {
  usage: DataSourceWithAgentsUsageType;
  onItemClick: (assistantSid: string) => void;
}) => {
  return usage.totalAgentCount === 0 ? (
    <Button
      icon={RobotIcon}
      variant="ghost"
      isSelect={false}
      size="sm"
      label={`${usage.totalAgentCount}`}
      disabled
    />
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={RobotIcon}
          variant="ghost"
          isSelect={true}
          size="sm"
          label={`${usage.totalAgentCount}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[300px]">
        <ScrollArea className="border-1 h-[130px]">
          {usage.publicAgentNames.map((name) => (
            <DropdownMenuItem
              key={`assistant-picker-${name}`}
              label={`@${name}`}
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(name);
              }}
            />
          ))}
          {usage.privateAgentCount > 0 && (
            <DropdownMenuItem
              label={`+ ${usage.privateAgentCount} private agent${pluralize(usage.privateAgentCount)}`}
              disabled={true}
            />
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
