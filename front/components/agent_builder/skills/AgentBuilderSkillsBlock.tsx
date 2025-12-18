import {
  Button,
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Spinner,
  ToolsIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { SkillsSheet } from "@app/components/agent_builder/skills/skillSheet/SkillsSheet";
import type { SkillsSheetMode } from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { ResourceAvatar } from "@app/components/resources/resources_icons";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getSkillIcon } from "@app/lib/skill";
import type { UserType, WorkspaceType } from "@app/types";

const BACKGROUND_IMAGE_PATH = "/static/SkillsBar.svg";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 14px",
  backgroundSize: "auto 60px",
  paddingTop: "90px",
};

interface SkillCardProps {
  skill: AgentBuilderSkillsType;
  onRemove: () => void;
}

function SkillCard({ skill, onRemove }: SkillCardProps) {
  const SkillIcon = getSkillIcon(skill.icon);

  return (
    <Card
      variant="primary"
      className="h-28"
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: Event) => {
            onRemove();
            e.stopPropagation();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <ResourceAvatar icon={SkillIcon} size="sm" />
          <span className="truncate">{skill.name}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">{skill.description}</span>
        </div>
      </div>
    </Card>
  );
}

interface AgentBuilderSkillsBlockProps {
  isSkillsLoading?: boolean;
  owner: WorkspaceType;
  user: UserType;
}

function AddSkillsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      label="Add skills"
      icon={ToolsIcon}
      variant="primary"
    />
  );
}

export function AgentBuilderSkillsBlock({
  isSkillsLoading,
  owner,
  user,
}: AgentBuilderSkillsBlockProps) {
  const { setValue, watch } = useFormContext<AgentBuilderFormData>();
  const { fields, remove } = useFieldArray<AgentBuilderFormData, "skills">({
    name: "skills",
  });

  // TODO(skills Jules): make a pass on the way we use reacthookform here
  const { mcpServerViews } = useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();

  const actions = watch("actions");
  const selectedSkills = watch("skills");
  const additionalSpaces = watch("additionalSpaces");

  // Compute space IDs already requested by actions (tools/knowledge)
  const alreadyRequestedSpaceIds = useMemo(() => {
    const spaceIdToActions = getSpaceIdToActionsMap(actions, mcpServerViews);
    const actionRequestedSpaceIds = new Set<string>();
    for (const spaceId of Object.keys(spaceIdToActions)) {
      if (spaceIdToActions[spaceId]?.length > 0) {
        actionRequestedSpaceIds.add(spaceId);
      }
    }

    // Also include space IDs from custom skills (those with canWrite: true have their own requestedSpaceIds)
    const selectedSkillIds = new Set(selectedSkills.map((s) => s.sId));
    for (const skill of allSkills) {
      if (selectedSkillIds.has(skill.sId) && skill.canWrite) {
        for (const spaceId of skill.requestedSpaceIds) {
          actionRequestedSpaceIds.add(spaceId);
        }
      }
    }

    return actionRequestedSpaceIds;
  }, [actions, mcpServerViews, selectedSkills, allSkills]);

  const [sheetMode, setSheetMode] = useState<SkillsSheetMode | null>(null);

  const handleOpenSheet = useCallback(() => {
    setSheetMode({
      pageId: SKILLS_SHEET_PAGE_IDS.SELECTION,
    });
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSheetMode(null);
  }, []);

  const handleSaveSkills = useCallback(
    (skills: AgentBuilderSkillsType[], newAdditionalSpaces: string[]) => {
      setValue("skills", skills, { shouldDirty: true });
      setValue("additionalSpaces", newAdditionalSpaces, { shouldDirty: true });
    },
    [setValue]
  );

  return (
    <AgentBuilderSectionContainer
      title="Skills"
      description="Give your agent a custom capability for specific tasks"
      headerActions={
        fields.length > 0 && <AddSkillsButton onClick={handleOpenSheet} />
      }
    >
      <div className="flex-1">
        {isSkillsLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : fields.length === 0 ? (
          <EmptyCTA
            action={<AddSkillsButton onClick={handleOpenSheet} />}
            className="pb-5"
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        ) : (
          <CardGrid>
            {fields.map((field, index) => (
              <SkillCard
                key={field.id}
                skill={field}
                onRemove={() => remove(index)}
              />
            ))}
          </CardGrid>
        )}
      </div>
      <SkillsSheet
        mode={sheetMode}
        onClose={handleCloseSheet}
        onSave={handleSaveSkills}
        onModeChange={setSheetMode}
        owner={owner}
        user={user}
        initialSelectedSkills={selectedSkills}
        initialAdditionalSpaces={additionalSpaces}
        alreadyRequestedSpaceIds={alreadyRequestedSpaceIds}
      />
    </AgentBuilderSectionContainer>
  );
}
