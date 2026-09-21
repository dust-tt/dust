import type { SkillLoadErrorReason } from "@app/components/skills/SkillDetailsBody";
import {
  SkillDetailsContent,
  SkillDetailsHeader,
  SkillLoadError,
} from "@app/components/skills/SkillDetailsBody";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import {
  useSkill,
  useUpdateSkillFavorite,
} from "@app/lib/swr/skill_configurations";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import { isSkillVisibleToViewer } from "@app/types/assistant/skill_configuration";
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
import { useCallback } from "react";

interface SkillDetailsProps {
  skillId: string | null;
  onClose: () => void;
  showFavoriteButton?: boolean;
  enforceDiscoveryVisibility?: boolean;
  owner: WorkspaceType;
  user: UserType;
  replaceOnEdit?: boolean;
}

function getSkillLoadErrorReason({
  isHidden,
  isNotFound,
}: {
  isHidden: boolean;
  isNotFound: boolean;
}): SkillLoadErrorReason {
  if (isHidden) {
    return "editors_only";
  }
  if (isNotFound) {
    return "not_found";
  }
  return "unavailable";
}

export function SkillDetailsSheet({
  skillId,
  onClose,
  showFavoriteButton = false,
  enforceDiscoveryVisibility = false,
  user,
  owner,
  replaceOnEdit,
}: SkillDetailsProps) {
  const { isAdmin } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const { skill, isSkillError, isSkillNotFound, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
    disabled: !skillId,
    shouldRetryOnError: false,
  });
  const { updateSkillFavorite } = useUpdateSkillFavorite({ owner });
  const isOpen = skillId !== null;

  // Discovery visibility does not restrict reading a skill through an existing reference.
  const isSkillHidden =
    enforceDiscoveryVisibility &&
    skill !== null &&
    !isAdmin &&
    !(
      skill.status === "suggested" &&
      hasPermission("create", "skill") &&
      skill.canAdministrate
    ) &&
    !isSkillVisibleToViewer({
      availability: skill.availability,
      viewerCanWrite: skill.canWrite,
    });
  const errorReason = getSkillLoadErrorReason({
    isHidden: isSkillHidden,
    isNotFound: isSkillNotFound,
  });

  const handleFavoriteChange = useCallback(
    async (
      skill: GetSkillsWithRelationsResponseBody["skills"][number],
      isFavorite: boolean
    ) => {
      const didUpdate = await updateSkillFavorite(skill, isFavorite);
      if (didUpdate) {
        await mutateSkill();
      }
    },
    [updateSkillFavorite, mutateSkill]
  );

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent size="lg" className="pb-4">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        {skill && !isSkillHidden ? (
          <>
            <SheetHeader>
              <SkillDetailsHeader
                skill={skill}
                owner={owner}
                onClose={onClose}
                replaceOnEdit={replaceOnEdit}
                onFavoriteChange={
                  showFavoriteButton ? handleFavoriteChange : undefined
                }
              />
            </SheetHeader>
            <SheetContainer className="pb-4">
              <SkillDetailsContent skill={skill} user={user} owner={owner} />
            </SheetContainer>
          </>
        ) : isSkillError || isSkillHidden ? (
          <SkillLoadError reason={errorReason} onRetry={mutateSkill} />
        ) : isOpen ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
