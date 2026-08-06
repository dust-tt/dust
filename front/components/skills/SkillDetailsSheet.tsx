import {
  SkillDetailsContent,
  SkillDetailsHeader,
  SkillLoadError,
} from "@app/components/skills/SkillDetailsBody";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

type SkillDetailsProps = {
  skill: GetSkillsWithRelationsResponseBody["skills"][number] | null;
  open?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onFavoriteChange?: (
    skill: GetSkillsWithRelationsResponseBody["skills"][number],
    isFavorite: boolean
  ) => Promise<void>;
  owner: WorkspaceType;
  user: UserType;
  replaceOnEdit?: boolean;
};

export function SkillDetailsSheet({
  skill,
  open,
  isError = false,
  onRetry,
  onClose,
  onFavoriteChange,
  user,
  owner,
  replaceOnEdit,
}: SkillDetailsProps) {
  const isOpen = open ?? skill !== null;

  // Fetch the full skill (with instructions/tools) for the content section,
  // since the list endpoint may not include them.
  const {
    skill: fullSkill,
    isSkillLoading,
    isSkillError: isFullSkillError,
    mutateSkill: retryFullSkill,
  } = useSkill({
    workspaceId: owner.sId,
    skillId: skill?.sId ?? null,
    disabled: !skill,
  });

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent size="lg" className="pb-4">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        {skill ? (
          <>
            <SheetHeader>
              <SkillDetailsHeader
                skill={skill}
                owner={owner}
                onClose={onClose}
                replaceOnEdit={replaceOnEdit}
                onFavoriteChange={onFavoriteChange}
              />
            </SheetHeader>
            <SheetContainer className="pb-4">
              {!fullSkill && isFullSkillError ? (
                <SkillLoadError onRetry={retryFullSkill} />
              ) : isSkillLoading || !fullSkill ? (
                <div className="flex justify-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : (
                <SkillDetailsContent
                  skill={{ ...fullSkill, relations: skill.relations }}
                  user={user}
                  owner={owner}
                />
              )}
            </SheetContainer>
          </>
        ) : isError ? (
          <SkillLoadError onRetry={onRetry} />
        ) : isOpen ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
