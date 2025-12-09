import {
  BookOpenIcon,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Spinner,
  ToolsIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";

const BACKGROUND_IMAGE_PATH = "/static/SkillsBar.svg";
const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("${BACKGROUND_IMAGE_PATH}")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 14px",
  backgroundSize: "auto 60px",
  paddingTop: "90px",
};

interface ActionCardProps {
  action: AgentBuilderSkillsType;
  onRemove: () => void;
  onEdit?: () => void;
}

function SkillCard({ action, onRemove, onEdit }: ActionCardProps) {
  const displayName = action.name;
  const description = action.description ?? "";

  return (
    <Card
      variant="primary"
      className="h-28"
      onClick={onEdit}
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
          <span className="truncate">{displayName}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">{description}</span>
        </div>
      </div>
    </Card>
  );
}

interface AgentBuilderSkillsBlockProps {
  isSkillsLoading?: boolean;
}

function AddSkillsButton({ onAddSkills }: { onAddSkills: () => void }) {
  return (
    <Button
      type="button"
      onClick={onAddSkills}
      label="Add skills"
      icon={ToolsIcon}
      variant="primary"
    />
  );
}

export function AgentBuilderSkillsBlock({
  isSkillsLoading,
}: AgentBuilderSkillsBlockProps) {
  const { getValues } = useFormContext<AgentBuilderFormData>();
  const { fields, remove, append, update } = useFieldArray<
    AgentBuilderFormData,
    "skills"
  >({
    name: "skills",
  });

  const skills = getValues("skills");

  const onAddSkills = () => {
    // For simplicity, we directly append a default skill here.
    const newSkill: AgentBuilderSkillsType = {
      id: `skill-${Date.now()}`,
      name: "New Skill",
      description: "Description of the new skill",
    };
    append(newSkill);
  };

  const onEditSkill = (updatedSkill: AgentBuilderSkillsType, index: number) => {
    update(index, updatedSkill);
  };

  return (
    <AgentBuilderSectionContainer
      title="Skills"
      description="Give your agent a custom capability for specific tasks"
      headerActions={
        fields.length > 0 && <AddSkillsButton onAddSkills={onAddSkills} />
      }
    >
      <div className="flex-1">
        {isSkillsLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : fields.length === 0 ? (
          <EmptyCTA
            action={<AddSkillsButton onAddSkills={onAddSkills} />}
            className="pb-5"
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        ) : (
          <>
            <CardGrid>
              {fields.map((field, index) => (
                <SkillCard
                  key={field.id}
                  action={field}
                  onRemove={() => remove(index)}
                  onEdit={() =>
                    onEditSkill({ ...field, name: "Updated Skill" }, index)
                  }
                />
              ))}
            </CardGrid>
          </>
        )}
      </div>
    </AgentBuilderSectionContainer>
  );
}
