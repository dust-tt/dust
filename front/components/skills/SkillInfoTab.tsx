import { Chip, ReadOnlyTextArea, Separator, Spinner } from "@dust-tt/sparkle";
import sortBy from "lodash/sortBy";
import { useMemo } from "react";

import { ResourceAvatar } from "@app/components/resources/resources_icons";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

interface SkillInfoTabProps {
  skill: SkillType;
  owner: LightWorkspaceType;
  spaces?: SpaceType[];
  dataSourceViews?: DataSourceViewType[];
  isDataSourceViewsLoading?: boolean;
  showDescription?: boolean;
}

export function SkillInfoTab({
  skill,
  owner,
  spaces,
  dataSourceViews,
  isDataSourceViewsLoading,
  showDescription = true,
}: SkillInfoTabProps) {
  const { isDark } = useTheme();

  const shouldLoadKnowledgeAndSpaces = skill.requestedSpaceIds.length > 0;
  const { spaces: spacesFromHook, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    disabled: !shouldLoadKnowledgeAndSpaces || !!spaces,
  });
  const {
    dataSourceViews: dataSourceViewsFromHook,
    isDataSourceViewsLoading: isDataSourceViewsLoadingFromHook,
  } = useDataSourceViews(owner, {
    disabled: !shouldLoadKnowledgeAndSpaces || !!dataSourceViews,
  });

  const resolvedSpaces = spaces ?? spacesFromHook;
  const resolvedDataSourceViews = dataSourceViews ?? dataSourceViewsFromHook;
  const resolvedIsDataSourceViewsLoading =
    isDataSourceViewsLoading ?? isDataSourceViewsLoadingFromHook;

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

  const knowledgeViews = useMemo(() => {
    if (!shouldLoadKnowledgeAndSpaces) {
      return [];
    }
    return resolvedDataSourceViews.filter((dsv) =>
      skill.requestedSpaceIds.includes(dsv.spaceId)
    );
  }, [
    resolvedDataSourceViews,
    shouldLoadKnowledgeAndSpaces,
    skill.requestedSpaceIds,
  ]);

  const sortedKnowledgeViews = useMemo(
    () =>
      sortBy(knowledgeViews, (dsv) =>
        getDisplayNameForDataSource(dsv.dataSource)
      ),
    [knowledgeViews]
  );

  const showSeparator =
    !!skill.instructions ||
    sortedMCPServerViews.length > 0 ||
    shouldLoadKnowledgeAndSpaces;

  return (
    <div className="flex flex-col gap-4">
      {showDescription && skill.userFacingDescription ? (
        <div className="text-sm text-foreground dark:text-foreground-night">
          {skill.userFacingDescription}
        </div>
      ) : null}

      {showSeparator ? <Separator /> : null}

      {skill.instructions && (
        <div className="dd-privacy-mask flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Instructions
          </div>
          <ReadOnlyTextArea content={skill.instructions} />
        </div>
      )}

      {shouldLoadKnowledgeAndSpaces ? (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Knowledge
          </div>
          {resolvedIsDataSourceViewsLoading ? (
            <div className="flex flex-row items-center gap-2">
              <Spinner size="xs" />
            </div>
          ) : sortedKnowledgeViews.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sortedKnowledgeViews.map((dsv) => {
                const Logo = getConnectorProviderLogoWithFallback({
                  provider: dsv.dataSource.connectorProvider,
                  isDark,
                });
                const title = getDisplayNameForDataSource(dsv.dataSource);
                return (
                  <Chip key={dsv.sId} label={title} size="sm">
                    <ResourceAvatar icon={Logo} size="xs" />
                  </Chip>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              No knowledge sources found in the required spaces.
            </div>
          )}
        </div>
      ) : null}

      {sortedMCPServerViews.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Tools
          </div>
          <div className="flex flex-wrap gap-2">
            {sortedMCPServerViews.map((view) => (
              <Chip key={view.title} label={view.title} size="sm">
                {view.avatar}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {shouldLoadKnowledgeAndSpaces ? (
        <div className="flex flex-col gap-5">
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
  avatar: getAvatar(view.server, "xs"),
});
