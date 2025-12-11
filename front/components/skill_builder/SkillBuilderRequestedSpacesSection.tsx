import { Chip } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { RemoveSpaceDialog } from "@app/components/shared/RemoveSpaceDialog";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

export function SkillBuilderRequestedSpacesSection() {
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();
  const tools = watch("tools");

  const { mcpServerViews } = useMCPServerViewsContext();
  const { spaces } = useSpacesContext();

  const [spaceToRemove, setSpaceToRemove] = useState<SpaceType | null>(null);

  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(tools, mcpServerViews);
  }, [tools, mcpServerViews]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    return spaces.filter(
      (s) => s.kind !== "global" && spaceIdToActions[s.sId]?.length > 0
    );
  }, [spaceIdToActions, spaces]);

  const handleRemoveSpace = (space: SpaceType) => {
    setSpaceToRemove(space);
  };

  const handleConfirmRemove = () => {
    if (!spaceToRemove) {
      return;
    }

    const actionsToRemove = spaceIdToActions[spaceToRemove.sId] || [];
    const actionIdsToRemove = new Set(actionsToRemove.map((a) => a.id));

    // Filter out the tools to remove and set the new value
    const newTools = tools.filter((t) => !actionIdsToRemove.has(t.id));
    setValue("tools", newTools);

    setSpaceToRemove(null);
  };

  if (nonGlobalSpacesUsedInActions.length === 0) {
    return null;
  }

  const actionsToRemove = spaceToRemove
    ? (spaceIdToActions[spaceToRemove.sId] || []).filter(
        (action): action is BuilderAction => action.type === "MCP"
      )
    : [];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
          Spaces
        </h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Determines who can use this skill and what data it can access
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {nonGlobalSpacesUsedInActions.map((space) => (
          <Chip
            key={space.sId}
            label={getSpaceName(space)}
            icon={getSpaceIcon(space)}
            onRemove={() => handleRemoveSpace(space)}
          />
        ))}
      </div>

      <RemoveSpaceDialog
        space={spaceToRemove}
        entityName="skill"
        actions={actionsToRemove}
        mcpServerViews={mcpServerViews}
        onClose={() => setSpaceToRemove(null)}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
