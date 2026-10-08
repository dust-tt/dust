import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import type { SearchMembersByEmailsResponseBody } from "@app/lib/api/workspace";
import { clientFetch } from "@app/lib/egress/client";
import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import chunk from "lodash/chunk";
import { useCallback } from "react";

type SearchedMember = SearchMembersByEmailsResponseBody["members"][number];

export function useSearchMembersByEmails({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();

  return useCallback(
    async (emails: string[]): Promise<SearchedMember[] | null> => {
      const results = await concurrentExecutor(
        chunk(emails, MAX_SEARCH_EMAILS),
        async (
          emailsChunk
        ): Promise<Result<SearchedMember[], { message: string }>> => {
          const response = await clientFetch(
            `/api/w/${owner.sId}/members/search`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emails: emailsChunk }),
            }
          );
          if (!response.ok) {
            return new Err(await getErrorFromResponse(response));
          }
          const body: SearchMembersByEmailsResponseBody = await response.json();
          return new Ok(body.members);
        },
        { concurrency: 4 }
      );

      const failed = results.find((r) => r.isErr());
      if (failed?.isErr()) {
        sendApiErrorNotification({
          title: t`We couldn't check which users are already members`,
          error: failed.error,
        });
        return null;
      }

      return results.flatMap((r) => (r.isOk() ? r.value : []));
    },
    [owner.sId, sendApiErrorNotification, t]
  );
}
