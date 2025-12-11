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
import React, { useCallback, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { SkillsSheet } from "@app/components/agent_builder/skills/skillSheet/SkillsSheet";
import type { SkillsSheetMode } from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILL_ICON } from "@app/lib/skill";

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
  const SkillIcon = SKILL_ICON;

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
          <SkillIcon className="h-4 w-4 shrink-0" />
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
}: AgentBuilderSkillsBlockProps) {
  const { getValues, setValue } = useFormContext<AgentBuilderFormData>();
  const { fields, remove } = useFieldArray<AgentBuilderFormData, "skills">({
    name: "skills",
  });

  const [sheetMode, setSheetMode] = useState<SkillsSheetMode | null>(null);

  const handleOpenSheet = useCallback(() => {
    setSheetMode({
      type: SKILLS_SHEET_PAGE_IDS.SELECTION,
      selectedSkills: getValues("skills"),
    });
  }, [getValues]);

  const handleCloseSheet = useCallback(() => {
    setSheetMode(null);
  }, []);

  const handleSaveSkills = useCallback(
    (skills: AgentBuilderSkillsType[]) => {
      setValue("skills", skills, { shouldDirty: true });
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
      />
    </AgentBuilderSectionContainer>
  );
}
