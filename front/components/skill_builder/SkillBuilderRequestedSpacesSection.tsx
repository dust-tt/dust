import { ContentMessage } from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useRemoveSpaceConfirm } from "@app/components/shared/RemoveSpaceDialog";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { removeNulls } from "@app/types/shared/utils/general";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { SpaceType } from "@app/types/space";

export function SkillBuilderRequestedSpacesSection() {
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();

  const tools = watch("tools");
  const attachedKnowledge = watch("attachedKnowledge");

  const { mcpServerViews } = useMCPServerViewsContext();
  const { spaces } = useSpacesContext();

  const confirmRemoveSpace = useRemoveSpaceConfirm({
    entityName: "skill",
    mcpServerViews,
  });

  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(tools, mcpServerViews);
  }, [tools, mcpServerViews]);

  const spaceIdsFromKnowledge = useMemo(() => {
    return new Set(attachedKnowledge?.map((k) => k.spaceId) ?? []);
  }, [attachedKnowledge]);

  const nonGlobalSpacesUsedInActions = useMemo(() => {
    return spaces.filter(
      (s) =>
        s.kind !== "global" &&
        (spaceIdToActions[s.sId]?.length > 0 ||
          spaceIdsFromKnowledge.has(s.sId))
    );
  }, [spaceIdToActions, spaceIdsFromKnowledge, spaces]);

  const knowledgeToRemoveBySpaceId = useMemo(() => {
    const map: Record<string, NonNullable<typeof attachedKnowledge>> = {};
    for (const k of attachedKnowledge ?? []) {
      if (!map[k.spaceId]) {
        map[k.spaceId] = [];
      }
      map[k.spaceId].push(k);
    }
    return map;
  }, [attachedKnowledge]);

  const handleRemoveSpace = async (space: SpaceType) => {
    const actionsToRemove = spaceIdToActions[space.sId] || [];
    const knowledgeInSpace = knowledgeToRemoveBySpaceId[space.sId] || [];

    // Don't show confirmation if nothing to remove.
    if (actionsToRemove.length === 0 && knowledgeInSpace.length === 0) {
      return;
    }

    const confirmed = await confirmRemoveSpace({
      space,
      actions: actionsToRemove,
      knowledgeInInstructions: knowledgeInSpace,
    });

    if (!confirmed) {
      return;
    }

    const actionIdsToRemove = new Set(actionsToRemove.map((a) => a.id));

    // Filter out the tools to remove and set the new value.
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
        <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
          Spaces
        </h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Sets what knowledge and tools the skill can access.
        </p>
      </div>
      {nonGlobalSpacesUsedInActions.length > 0 && (
        <div className="mb-4 w-full">
          <ContentMessage variant="golden" size="lg">
            Based on your selection of knowledge and tools, this skill can only
            be used by users with access to space
            {pluralize(nonGlobalSpacesUsedInActions.length)} :{" "}
            <strong>
              {nonGlobalSpacesUsedInActions.map((v) => v.name).join(", ")}
            </strong>
            .
          </ContentMessage>
        </div>
      )}
      <SpaceChips spaces={spacesToDisplay} onRemoveSpace={handleRemoveSpace} />
    </div>
  );
}
