import { ConfirmContext } from "@app/components/Confirm";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  useSkill,
  useSkillsWithRelations,
} from "@app/lib/swr/skill_configurations";
import {
  useAddSpaceMembers,
  useSpaces,
  useSpacesAsAdmin,
} from "@app/lib/swr/spaces";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ContentMessage, Lock01, UsersPlus } from "@dust-tt/sparkle";
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
  // Spaces the caller is a member of, and every space of the workspace to name the missing ones.
  const { spaces: memberSpaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
  });
  const { spaces: allSpaces } = useSpacesAsAdmin({ workspaceId: owner.sId });
  const { user } = useAuth();
  const addSpaceMembers = useAddSpaceMembers({ owner });
  const { mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId: skill.sId,
    disabled: true, // We only use the hook to mutate the cache
  });
  const {
    mutateSkillsWithRelationsRegardlessOfQueryParams: mutateSkillsWithRelations,
  } = useSkillsWithRelations({
    owner,
    status: "active",
    disabled: true, // We only use the hook to mutate the cache
  });
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

  // Adds the admin to every requested space they are not a member of, with the same security
  // notice as the space settings modal.
  const handleJoinSpaces = async () => {
    if (isJoiningSpaces) {
      return;
    }
    const confirmed = await confirm({
      title: "Security notice",
      message:
        `You are about to join ${missingSpaceIds.length === 1 ? "this space" : "these spaces"}. ` +
        "This action will be logged for security purposes. Do you want to proceed?",
      validateLabel: "Proceed",
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
          await addSpaceMembers(space, [user.sId], {
            title: `Joined ${space.name}`,
            description: `You are now a member of ${space.name}.`,
          });
        },
        { concurrency: 4 }
      );
      void mutateSkill();
      void mutateSkillsWithRelations();
    } finally {
      setIsJoiningSpaces(false);
    }
  };

  return (
    <ContentMessage title="Restricted access" icon={Lock01} size="md">
      <div className="flex flex-col gap-2">
        <span>You cannot see the guidelines of this skill.</span>
        {missingSpaceNames.length > 0 && (
          <>
            <span>
              The skill uses restricted spaces you are not a member of:{" "}
              {missingSpaceNames.join(", ")}.
            </span>
            <div>
              <Button
                variant="outline"
                size="sm"
                icon={UsersPlus}
                label={
                  missingSpaceNames.length === 1
                    ? `Join space ${missingSpaceNames[0]}`
                    : "Join all required spaces"
                }
                isLoading={isJoiningSpaces}
                disabled={isJoiningSpaces}
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
