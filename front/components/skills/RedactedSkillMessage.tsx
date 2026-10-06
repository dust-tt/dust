import { ConfirmContext } from "@app/components/Confirm";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  useInvalidateSkills,
  useSkill,
} from "@app/lib/swr/skill_configurations";
import {
  REQUESTABLE_SPACE_KINDS,
  useAddSpaceMembers,
  useSpaces,
  useSpacesAsAdmin,
} from "@app/lib/swr/spaces";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ContentMessage, Lock01, UsersPlus } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useContext, useState } from "react";

// Explains to an admin why the private fields of a skill were redacted: it requires spaces they
// are not a member of. Offers to join them, which is the only way to read the skill.
export function RedactedSkillMessage({
  skill,
  owner,
}: {
  skill: SkillType;
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  // Spaces the caller is a member of, and every space of the workspace to name the missing ones.
  const { spaces: memberSpaces, isSpacesLoading: isMemberSpacesLoading } =
    useSpaces({
      workspaceId: owner.sId,
      kinds: "all",
    });
  const { spaces: allSpaces, isSpacesLoading: isAllSpacesLoading } =
    useSpacesAsAdmin({
      workspaceId: owner.sId,
      kinds: REQUESTABLE_SPACE_KINDS,
    });
  const isSpacesLoading = isMemberSpacesLoading || isAllSpacesLoading;
  const { user } = useAuth();
  const addSpaceMembers = useAddSpaceMembers({ owner });
  const { mutateSkillRegardlessOfQueryParams: mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId: skill.sId,
    disabled: true, // We only use the hook to mutate the cache
  });
  const invalidateSkills = useInvalidateSkills({ workspaceId: owner.sId });
  const [isJoiningSpaces, setIsJoiningSpaces] = useState(false);
  const confirm = useContext(ConfirmContext);

  const memberSpaceIds = new Set(memberSpaces.map((s) => s.sId));
  const spaceById = new Map(allSpaces.map((s) => [s.sId, s]));
  const missingSpaceIds = skill.requestedSpaceIds.filter(
    (sId) => !memberSpaceIds.has(sId)
  );
  const missingSpaceNames = missingSpaceIds.map(
    (sId) => spaceById.get(sId)?.name ?? sId
  );
  const missingSpaceCount = missingSpaceIds.length;
  const missingSpaceNamesList = missingSpaceNames.join(", ");
  const firstMissingSpaceName = missingSpaceNames[0];

  // Adds the admin to every requested space they are not a member of, with the same security
  // notice as the space settings modal.
  const handleJoinSpaces = async () => {
    if (isJoiningSpaces) {
      return;
    }
    const confirmed = await confirm({
      title: t`Security notice`,
      message: t`${plural(missingSpaceCount, {
        one: "You are about to join this space. This action will be logged for security purposes. Do you want to proceed?",
        other:
          "You are about to join these spaces. This action will be logged for security purposes. Do you want to proceed?",
      })}`,
      validateLabel: t`Proceed`,
      validateVariant: "warning",
    });
    if (!confirmed) {
      return;
    }

    setIsJoiningSpaces(true);
    try {
      // The spaces are independent, so they are joined concurrently.
      await concurrentExecutor(
        missingSpaceIds,
        async (spaceId) => {
          const space = spaceById.get(spaceId);
          if (!space) {
            return;
          }
          const spaceName = space.name;
          await addSpaceMembers(space, [user.sId], {
            title: t`Joined ${spaceName}`,
            description: t`You are now a member of ${spaceName}.`,
          });
        },
        { concurrency: 4 }
      );
      void mutateSkill();
      void invalidateSkills();
    } finally {
      setIsJoiningSpaces(false);
    }
  };

  return (
    <ContentMessage title={t`Restricted access`} icon={Lock01} size="md">
      <div className="flex flex-col gap-2">
        <span>
          <Trans>You cannot see the guidelines of this skill.</Trans>
        </span>
        {missingSpaceNames.length > 0 && (
          <>
            <span>
              <Trans>
                The skill uses restricted spaces you are not a member of:{" "}
                {missingSpaceNamesList}.
              </Trans>
            </span>
            <div>
              <Button
                variant="outline"
                size="sm"
                icon={UsersPlus}
                label={
                  missingSpaceNames.length === 1
                    ? t`Join space ${firstMissingSpaceName}`
                    : t`Join all required spaces`
                }
                isLoading={isSpacesLoading || isJoiningSpaces}
                disabled={isSpacesLoading || isJoiningSpaces}
                onClick={() => {
                  void handleJoinSpaces();
                }}
                type="button"
              />
            </div>
          </>
        )}
      </div>
    </ContentMessage>
  );
}
