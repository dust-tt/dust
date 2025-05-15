import {
  Button,
  ChevronDownIcon,
  Chip,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useUpdateAgentTags } from "@app/lib/swr/tags";
import type { WorkspaceType } from "@app/types";
import type { TagType } from "@app/types/tag";

type TableTagSelectorProps = {
  tags: TagType[];
  agentTags: TagType[];
  agentConfigurationId: string;
  owner: WorkspaceType;
  onChange: () => Promise<any>;
};

export const TableTagSelector = ({
  tags,
  agentTags,
  agentConfigurationId,
  owner,
  onChange,
}: TableTagSelectorProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { isDark } = useTheme();
  const updateAgentTags = useUpdateAgentTags({
    owner,
    agentConfigurationId,
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {agentTags.length === 0 ? (
          <Button
            variant="ghost"
            size="xs"
            label="Add tags"
            isSelect
            className="invisible text-muted-foreground group-hover:visible dark:text-muted-foreground-night"
          />
        ) : (
          <Button
            variant="ghost"
            icon={ChevronDownIcon}
            size="xmini"
            className="invisible text-muted-foreground group-hover:visible dark:text-muted-foreground-night"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {tags.map((t) => {
          const isChecked = agentTags.some((x) => x.sId === t.sId);
          return (
            <DropdownMenuCheckboxItem
              key={t.sId}
              onClick={async (e: React.MouseEvent) => {
                setIsLoading(true);
                e.stopPropagation();
                e.preventDefault();
                await updateAgentTags({
                  addTagIds: isChecked ? [] : [t.sId],
                  removeTagIds: isChecked ? [t.sId] : [],
                });
                await onChange();
              }}
              checked={isChecked}
            >
              <Chip size="xs" label={t.name} color="golden" />
            </DropdownMenuCheckboxItem>
          );
        })}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50">
            <Spinner variant={isDark ? "light" : "dark"} />
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
