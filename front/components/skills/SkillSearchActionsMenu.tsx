import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { SkillActionsMenu } from "@app/components/skills/SkillActionsMenu";
import { useSkillMenuItems } from "@app/hooks/useSkillMenuItems";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import { useState } from "react";

interface SkillSearchActionsMenuProps {
  owner: LightWorkspaceType;
  skillId: string;
  onSelect: (skillId: string) => void;
  onRefresh: () => void;
}

export function SkillSearchActionsMenu({
  owner,
  skillId,
  onSelect,
  onRefresh,
}: SkillSearchActionsMenuProps) {
  const getSkillMenuItems = useSkillMenuItems({ owner });
  const [isOpen, setIsOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const { skill, isSkillLoading, isSkillError, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
    disabled: !isOpen && !isArchiveDialogOpen,
    shouldRetryOnError: false,
  });

  const statusItems: MenuItem[] = [];
  if (isSkillLoading) {
    statusItems.push({
      kind: "item",
      label: "Loading actions…",
      icon: () => <Spinner size="xs" />,
      disabled: true,
    });
  } else if (isSkillError) {
    statusItems.push({
      kind: "item",
      label: "Could not load actions. Retry",
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        void mutateSkill();
      },
    });
  }

  return (
    <>
      <SkillActionsMenu
        menuItems={[
          ...statusItems,
          ...getSkillMenuItems({
            skillId,
            canEdit:
              !isSkillLoading &&
              !isSkillError &&
              !!skill?.canAdministrate &&
              skill.canRead,
            onSelect: () => onSelect(skillId),
            onArchive:
              !isSkillError && skill?.canAdministrate
                ? () => {
                    setIsOpen(false);
                    requestAnimationFrame(() => {
                      setIsArchiveDialogOpen(true);
                    });
                  }
                : undefined,
          }),
        ]}
        onOpenChange={setIsOpen}
      />
      {skill && (
        <ArchiveSkillDialog
          owner={owner}
          skill={skill}
          isOpen={isArchiveDialogOpen}
          onClose={() => {
            setIsArchiveDialogOpen(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
