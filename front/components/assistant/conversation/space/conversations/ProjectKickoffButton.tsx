import { Button, RocketIcon } from "@dust-tt/sparkle";

import { useProjectKickoff } from "@app/hooks/useProjectKickoff";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { SpaceType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";

interface ProjectKickoffButtonProps {
  owner: WorkspaceType;
  user: UserType;
  space: SpaceType;
}

export function ProjectKickoffButton({
  owner,
  user,
  space,
}: ProjectKickoffButtonProps) {
  const router = useAppRouter();
  const { kickoffProject, isCreating } = useProjectKickoff({
    owner,
    user,
    space,
  });

  const handleKickoff = async () => {
    const conversation = await kickoffProject();
    if (conversation) {
      void router.push(getConversationRoute(owner.sId, conversation.sId));
    }
  };

  return (
    <Button
      label="Kick-off project"
      icon={RocketIcon}
      variant="primary"
      onClick={handleKickoff}
      isLoading={isCreating}
    />
  );
}
