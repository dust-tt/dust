import { useProjectKickoff } from "@app/hooks/useProjectKickoff";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { SpaceType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { Rocket } from "@app/components/assistant/conversation/icons";

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
      icon={Rocket}
      variant="primary"
      onClick={handleKickoff}
      isLoading={isCreating}
    />
  );
}
