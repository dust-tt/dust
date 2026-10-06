import { useSendNotification } from "@app/hooks/useNotification";
import type { SearchMembersAdminResponseBody } from "@app/lib/api/workspace";
import { clientFetch } from "@app/lib/egress/client";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  LightWorkspaceType,
  UserTypeWithWorkspace,
} from "@app/types/user";
import chunk from "lodash/chunk";
import { useCallback } from "react";

export function useSearchMembersByEmails({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  return useCallback(
    async (emails: string[]): Promise<UserTypeWithWorkspace[] | null> => {
      try {
        const responses = await concurrentExecutor(
          chunk(emails, MAX_SEARCH_EMAILS),
          async (emailsChunk): Promise<SearchMembersAdminResponseBody> => {
            const response = await clientFetch(
              `/api/w/${owner.sId}/members/search`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emails: emailsChunk }),
              }
            );
            if (!response.ok) {
              throw new Error("Failed to fetch member information");
            }
            return response.json();
          },
          { concurrency: 4 }
        );
        return responses.flatMap((response) => response.members);
      } catch {
        sendNotification({
          type: "error",
          title: "Invitation failed",
          description: "We couldn't check which users are already members.",
        });
        return null;
      }
    },
    [owner.sId, sendNotification]
  );
}
