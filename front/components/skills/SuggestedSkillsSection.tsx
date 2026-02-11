import {
  Button,
  Card,
  CardActionButton,
  PlusIcon,
  SparklesIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { useAppRouter } from "@app/lib/platform";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { useUpdateSkillEditors } from "@app/lib/swr/skill_editors";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType, UserType } from "@app/types/user";

type SuggestedSkillCardProps = {
  skill: SkillWithRelationsType;
  onMoreInfoClick: () => void;
  owner: LightWorkspaceType;
  user: UserType;
};

function SuggestedSkillCard({
  skill,
  onMoreInfoClick,
  owner,
  user,
}: SuggestedSkillCardProps) {
  const router = useAppRouter();
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const SkillAvatar = getSkillAvatarIcon(skill.icon);
  const updateSkillEditors = useUpdateSkillEditors({
    owner,
    skillId: skill.sId,
  });

  const handleAddSkillClick = async () => {
    setIsAddingSkill(true);
    try {
      await updateSkillEditors({
        addEditorIds: [user.sId],
        removeEditorIds: [],
      });
      void router.push(getSkillBuilderRoute(owner.sId, skill.sId));
    } finally {
      setIsAddingSkill(false);
    }
  };

  return (
    <>
      <ArchiveSkillDialog
        skill={skill}
        isOpen={isArchiveDialogOpen}
        onClose={() => setIsArchiveDialogOpen(false)}
        owner={owner}
      />
      <Card
        variant="primary"
        onClick={onMoreInfoClick}
        action={
          <CardActionButton
            size="icon"
            icon={XMarkIcon}
            onClick={(e) => {
              e.stopPropagation();
              setIsArchiveDialogOpen(true);
            }}
          />
        }
      >
        <div className="flex h-full w-full flex-col justify-between gap-3">
          <div className="flex flex-col">
            <div className="mb-2 flex items-center gap-2">
              <SkillAvatar size="sm" />
              <span className="truncate text-sm font-medium">{skill.name}</span>
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
              {skill.userFacingDescription}
            </p>
          </div>
          <div>
            <Button
              size="xs"
              variant="outline"
              icon={PlusIcon}
              label="Add skill"
              isLoading={isAddingSkill}
              onClick={(e) => {
                e.stopPropagation();
                void handleAddSkillClick();
              }}
            />
          </div>
        </div>
      </Card>
    </>
  );
}

type SuggestedSkillsSectionProps = {
  skills: SkillWithRelationsType[];
  onSkillClick: (skill: SkillWithRelationsType) => void;
  owner: LightWorkspaceType;
  user: UserType;
};

export function SuggestedSkillsSection({
  skills,
  onSkillClick,
  owner,
  user,
}: SuggestedSkillsSectionProps) {
  if (skills.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 flex flex-col gap-3 pb-6">
      <h4 className="heading-sm flex items-center gap-1.5 text-foreground dark:text-foreground-night">
        Suggested skills
        <SparklesIcon className="h-4 w-4" />
      </h4>
      <div className="flex gap-2 overflow-x-auto">
        {skills.map((skill) => (
          <div key={skill.sId} className="max-w-80 flex-shrink-0">
            <SuggestedSkillCard
              key={skill.sId}
              skill={skill}
              onMoreInfoClick={() => onSkillClick(skill)}
              owner={owner}
              user={user}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
