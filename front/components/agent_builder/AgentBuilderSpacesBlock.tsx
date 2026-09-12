import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SpaceSelectionSheet } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import { useAgentRequestedSpaces } from "@app/components/agent_builder/hooks/useAgentRequestedSpaces";
import { useRemoveAgentSpace } from "@app/components/agent_builder/hooks/useRemoveAgentSpace";
import { SpaceChips } from "@app/components/shared/SpaceChips";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SpaceType } from "@app/types/space";
import { Button, Planet } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

interface AgentBuilderSpacesBlockProps {
  initialRequestedSpaceIds?: string[];
}

export function AgentBuilderSpacesBlock({
  initialRequestedSpaceIds,
}: AgentBuilderSpacesBlockProps) {
  const { setValue } = useFormContext<AgentBuilderFormData>();

  const {
    actionsAndSkillsRequestedSpaceIds,
    globalSpace,
    missingSpaceIds,
    nonGlobalSpacesUsedByAgent,
    spaceIdToActions,
  } = useAgentRequestedSpaces({ initialRequestedSpaceIds });

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [draftSelectedSpaces, setDraftSelectedSpaces] = useState<string[]>([]);

  const additionalSpaces = useWatch<AgentBuilderFormData, "additionalSpaces">({
    name: "additionalSpaces",
  });

  const { removeSpace } = useRemoveAgentSpace({ spaceIdToActions });

  const handleRemoveSpace = async (space: SpaceType) => {
    await removeSpace(space);
  };

  const handleOpenSheet = () => {
    // Initialize with current additional spaces so they appear selected
    setDraftSelectedSpaces([...additionalSpaces]);
    setIsSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setIsSheetOpen(false);
    setDraftSelectedSpaces([]);
  };

  const handleSaveSpaces = () => {
    setValue("additionalSpaces", draftSelectedSpaces, { shouldDirty: true });
    handleCloseSheet();
  };

  const spacesToDisplay = useMemo(() => {
    return removeNulls([globalSpace, ...nonGlobalSpacesUsedByAgent]);
  }, [globalSpace, nonGlobalSpacesUsedByAgent]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="heading-lg text-foreground">Data and access</h2>
          <p className="text-sm text-muted-foreground max-w-9/10">
            Adding spaces or pods will make the data from each of them available
            to the agent. Only members of all the spaces and pods listed will
            have access to the agent.
          </p>
        </div>
        <Button
          label="Manage"
          icon={Planet}
          variant="outline"
          onClick={handleOpenSheet}
        />
      </div>
      <SpaceChips spaces={spacesToDisplay} onRemoveSpace={handleRemoveSpace} />

      <SpaceSelectionSheet
        alreadyRequestedSpaceIds={actionsAndSkillsRequestedSpaceIds}
        entityName="agent"
        missingSpaceIds={missingSpaceIds}
        onClose={handleCloseSheet}
        onSave={handleSaveSpaces}
        open={isSheetOpen}
        selectedSpaces={draftSelectedSpaces}
        setSelectedSpaces={setDraftSelectedSpaces}
      />
    </div>
  );
}
