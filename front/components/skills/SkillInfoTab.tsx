import { KnowledgeChip } from "@app/components/editor/extensions/skill_builder/KnowledgeChip";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { isFullKnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { SkillInstructionsReadOnlyEditor } from "@app/components/skills/SkillInstructionsReadOnlyEditor";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import { useSpaces } from "@app/lib/swr/spaces";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, Separator, Spinner, Tooltip } from "@dust-tt/sparkle";
import sortBy from "lodash/sortBy";
import { useCallback, useMemo, useState } from "react";

interface SkillInfoTabProps {
  skill: SkillType;
  owner: LightWorkspaceType;
  spaces?: SpaceType[];
  showDescription?: boolean;
}

export function SkillInfoTab({
  skill,
  owner,
  spaces,
  showDescription = true,
}: SkillInfoTabProps) {
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);

  const shouldLoadSpaces = skill.requestedSpaceIds.length > 0;
  const { spaces: spacesFromHook, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global", "regular", "project"],
    disabled: !shouldLoadSpaces || !!spaces,
  });

  const resolvedSpaces = spaces ?? spacesFromHook;

  const sortedMCPServerViews = useMemo(
    () => sortBy(skill.tools.map(renderMCPServerView), "title"),
    [skill.tools]
  );

  const requestedSpaces = useMemo(
    () =>
      resolvedSpaces
        .filter((s) => skill.requestedSpaceIds.includes(s.sId))
        .map((space) => ({
          space,
          name: getSpaceName(space),
          Icon: getSpaceIcon(space),
        })),
    [resolvedSpaces, skill.requestedSpaceIds]
  );

  const sortedSpaces = useMemo(
    () => sortBy(requestedSpaces, "name"),
    [requestedSpaces]
  );

  const handleKnowledgeItemsChange = useCallback((items: KnowledgeItem[]) => {
    setKnowledgeItems(items);
  }, []);

  const showSeparator =
    !!skill.instructions ||
    knowledgeItems.length > 0 ||
    sortedMCPServerViews.length > 0 ||
    shouldLoadSpaces;

  return (
    <div className="flex flex-col gap-4">
      {showDescription && skill.userFacingDescription ? (
        <div className="text-sm text-foreground dark:text-foreground-night">
          {skill.userFacingDescription}
        </div>
      ) : null}

      {showSeparator ? <Separator /> : null}

      {skill.instructions && (
        <div className="dd-privacy-mask flex flex-col gap-4">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Instructions
          </div>
          <SkillInstructionsReadOnlyEditor
            content={skill.instructions}
            owner={owner}
            onKnowledgeItemsChange={handleKnowledgeItemsChange}
          />
        </div>
      )}
      {knowledgeItems.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Knowledge
          </div>
          <div className="flex flex-wrap gap-2">
            {knowledgeItems.filter(isFullKnowledgeItem).map((item) => (
              <KnowledgeChip
                key={item.nodeId}
                node={item.node}
                title={item.label}
                color="primary"
              />
            ))}
          </div>
        </div>
      )}
      {sortedMCPServerViews.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Tools
          </div>
          <div className="grid grid-cols-2 gap-2">
            {sortedMCPServerViews.map((view) => (
              <Tooltip
                key={view.title}
                label={view.description ?? view.title}
                trigger={
                  <div className="flex flex-row items-center gap-2">
                    {view.avatar}
                    <div className="truncate">{view.title}</div>
                  </div>
                }
                tooltipTriggerAsChild
              />
            ))}
          </div>
        </div>
      )}

      {shouldLoadSpaces ? (
        <div className="flex flex-col gap-4">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Spaces
          </div>
          {isSpacesLoading ? (
            <div className="flex flex-row items-center gap-2">
              <Spinner size="xs" />
            </div>
          ) : sortedSpaces.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sortedSpaces.map(({ space, name, Icon }) => (
                <Chip key={space.sId} label={name} size="sm">
                  <Icon className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const renderMCPServerView = (view: MCPServerViewType) => ({
  title: getMcpServerViewDisplayName(view),
  description: getMcpServerViewDescription(view),
  avatar: getAvatar(view.server, "xs"),
});
