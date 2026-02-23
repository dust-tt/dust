import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useUpdateAgentTags } from "@app/lib/swr/tags";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import {
  Button,
  CheckIcon,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

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
  });
  if (isGlobalAgentId(agentConfigurationId)) {
    return null;
  }

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
      <DropdownMenuContent
        mountPortalContainer={document.body}
        className="w-60"
      >
        <DropdownMenuLabel label="Available tags" />
        <DropdownMenuSeparator />
        <DropdownMenuTagList>
          {tags.length === 0 ? (
            <div className="px-2 py-2 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
              No tags available
            </div>
          ) : (
            tags
              .filter((t) => isBuilder(owner) || t.kind !== "protected")
              .map((t) => {
                const isChecked = agentTags.some((x) => x.sId === t.sId);
                return (
                  <div
                    key={t.sId}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <DropdownMenuTagItem
                      label={t.name}
                      color="golden"
                      icon={isChecked ? CheckIcon : undefined}
                      onClick={async () => {
                        setIsLoading(true);
                        await updateAgentTags(agentConfigurationId, {
                          addTagIds: isChecked ? [] : [t.sId],
                          removeTagIds: isChecked ? [t.sId] : [],
                        });
                        await onChange();
                      }}
                    />
                  </div>
                );
              })
          )}
        </DropdownMenuTagList>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50">
            <Spinner variant={isDark ? "light" : "dark"} />
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
