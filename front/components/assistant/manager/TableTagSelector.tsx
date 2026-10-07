import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useUpdateAgentTags } from "@app/lib/swr/tags";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { TagType } from "@app/types/tag";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Check,
  ChevronDown,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const [isLoading, setIsLoading] = useState(false);
  const { isDark } = useTheme();
  const updateAgentTags = useUpdateAgentTags({
    owner,
  });
  const { hasPermission } = useWorkspacePermissions();
  const canPublishAgents = hasPermission("publish", "agent");
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
            label={t`Add tags`}
            isSelect
            className="invisible text-muted-foreground group-hover:visible"
          />
        ) : (
          <Button
            variant="ghost"
            icon={ChevronDown}
            size="xmini"
            className="invisible text-muted-foreground group-hover:visible"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        mountPortalContainer={document.body}
        className="w-60"
      >
        <DropdownMenuLabel label={t`Available tags`} />
        <DropdownMenuSeparator />
        <DropdownMenuTagList>
          {tags.length === 0 ? (
            <div className="px-2 py-2 text-center text-sm text-muted-foreground">
              <Trans>No tags available</Trans>
            </div>
          ) : (
            tags
              .filter((tag) => canPublishAgents || tag.kind !== "protected")
              .map((tag) => {
                const isChecked = agentTags.some((x) => x.sId === tag.sId);
                return (
                  <div
                    key={tag.sId}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <DropdownMenuTagItem
                      label={tag.name}
                      color="info"
                      icon={isChecked ? Check : undefined}
                      onClick={async () => {
                        setIsLoading(true);
                        await updateAgentTags(agentConfigurationId, {
                          addTagIds: isChecked ? [] : [tag.sId],
                          removeTagIds: isChecked ? [tag.sId] : [],
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
