import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useRemoveSpaceConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { SpaceType } from "@app/types";
import { removeNulls } from "@app/types";

export function SkillBuilderRequestedSpacesSection() {
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();

  const tools = watch("tools");

  const { mcpServerViews } = useMCPServerViewsContext();
  const { spaces } = useSpacesContext();

  const confirmRemoveSpace = useRemoveSpaceConfirm({
    entityName: "skill",
    mcpServerViews,
  });

  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(tools, mcpServerViews);
  }, [tools, mcpServerViews]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    return spaces.filter(
      (s) => s.kind !== "global" && spaceIdToActions[s.sId]?.length > 0
    );
  }, [spaceIdToActions, spaces]);

  const handleRemoveSpace = async (space: SpaceType) => {
    const actionsToRemove = (spaceIdToActions[space.sId] || []).filter(
      (action): action is BuilderAction => action.type === "MCP"
    );

    const confirmed = await confirmRemoveSpace(space, actionsToRemove);

    if (!confirmed) {
      return;
    }

    const actionIdsToRemove = new Set(actionsToRemove.map((a) => a.id));

    // Filter out the tools to remove and set the new value
    const newTools = tools.filter((t) => !actionIdsToRemove.has(t.id));
    setValue("tools", newTools, { shouldDirty: true });
  };

  const globalSpace = useMemo(() => {
    return spaces.find((s) => s.kind === "global");
  }, [spaces]);
  const spacesToDisplay = useMemo(() => {
    return removeNulls([globalSpace, ...nonGlobalSpacesUsedInActions]);
  }, [globalSpace, nonGlobalSpacesUsedInActions]);

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
      <SpaceChips spaces={spacesToDisplay} onRemoveSpace={handleRemoveSpace} />
    </div>
  );
}
