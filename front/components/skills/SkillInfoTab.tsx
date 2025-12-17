import { Page, ReadOnlyTextArea } from "@dust-tt/sparkle";
import sortBy from "lodash/sortBy";
import { useMemo } from "react";

import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type {
  SkillRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";

export function SkillInfoTab({
  skill,
}: {
  skill: SkillType & { relations?: SkillRelations };
}) {
  const sortedMCPServerViews = useMemo(
    () =>
      sortBy(
        (skill.relations?.mcpServerViews ?? []).map(renderMCPServerView),
        "title"
      ),
    [skill.relations?.mcpServerViews]
  );

  return (
    <div className="flex flex-col gap-4">
      {skill.userFacingDescription && (
        <div className="text-sm text-foreground dark:text-foreground-night">
          {skill.userFacingDescription}
        </div>
      )}

      <Page.Separator />

      {skill.instructions && (
        <div className="dd-privacy-mask flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Instructions
          </div>
          <ReadOnlyTextArea content={skill.instructions} />
        </div>
      )}

      {sortedMCPServerViews.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Tools
          </div>
          <div className="grid grid-cols-2 gap-2">
            {sortedMCPServerViews.map((view) => (
              <div
                className="flex min-w-0 flex-row items-center gap-2"
                key={view.title}
              >
                {view.avatar}
                <div className="truncate" title={view.title}>
                  {view.title}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const renderMCPServerView = (view: MCPServerViewType) => ({
  title: getMcpServerViewDisplayName(view),
  avatar: getAvatar(view.server, "xs"),
});
