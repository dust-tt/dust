import type { SkillLoadErrorReason } from "@app/components/skills/SkillDetailsBody";
import {
  SkillDetailsContent,
  SkillDetailsHeader,
  SkillLoadError,
} from "@app/components/skills/SkillDetailsBody";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
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

interface SkillDetailsProps {
  skill: SkillWithRelationsType | null;
  open?: boolean;
  isError?: boolean;
  errorReason?: SkillLoadErrorReason;
  onRetry?: () => void;
  onClose: () => void;
  onFavoriteChange?: (
    skill: GetSkillsWithRelationsResponseBody["skills"][number],
    isFavorite: boolean
  ) => Promise<void>;
  owner: WorkspaceType;
  user: UserType;
  replaceOnEdit?: boolean;
}

export function SkillDetailsSheet({
  skill,
  open,
  isError = false,
  errorReason,
  onRetry,
  onClose,
  onFavoriteChange,
  user,
  owner,
  replaceOnEdit,
}: SkillDetailsProps) {
  const isOpen = open ?? skill !== null;

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
              <SkillDetailsContent skill={skill} user={user} owner={owner} />
            </SheetContainer>
          </>
        ) : isError ? (
          <SkillLoadError reason={errorReason} onRetry={onRetry} />
        ) : isOpen ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
