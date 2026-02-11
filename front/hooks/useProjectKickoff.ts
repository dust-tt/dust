import { useCallback, useState } from "react";

import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  buildProjectKickoffPrompt,
  PROJECT_KICKOFF_AGENT,
} from "@app/lib/api/assistant/project_kickoff";
import type { SpaceType } from "@app/types/space";
import type { UserType, WorkspaceType } from "@app/types/user";

export function useProjectKickoff({
  owner,
  user,
  space,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  space: SpaceType;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const sendNotification = useSendNotification();
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const kickoffProject = useCallback(async () => {
    if (!user || isCreating) {
      return null;
    }

    setIsCreating(true);

    const prompt = buildProjectKickoffPrompt({
      projectName: space.name,
      userName: user.username,
    });

    const result = await createConversationWithMessage({
      messageData: {
        input: prompt,
        mentions: [{ configurationId: PROJECT_KICKOFF_AGENT }],
        contentFragments: { uploaded: [], contentNodes: [] },
        origin: "project_kickoff",
      },
      spaceId: space.sId,
      visibility: "unlisted",
      title: `Kickoff: ${space.name}`,
    });

    setIsCreating(false);

    if (result.isErr()) {
      sendNotification({
        title: result.error.title,
        description: result.error.message,
        type: "error",
      });
      return null;
    }

    return result.value;
  }, [
    user,
    isCreating,
    space,
    createConversationWithMessage,
    sendNotification,
  ]);

  return { kickoffProject, isCreating };
}
