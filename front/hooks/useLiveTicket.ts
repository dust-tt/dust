import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type {
  PostCollabTicketRequestBody,
  PostCollabTicketResponseBody,
} from "@app/types/api/file_system/types";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

/**
 * Returns a function fetching a one-time ticket to open `filePath` in its live session, called
 * for each connection.
 */
/**
 * @cc [owner:PopDaph,label:error-handling] live-ticket-rejects
 * The returned function MUST reject when no ticket can be fetched, an exception to
 * `no-catching-own-errors` limited to it: the live session's provider takes it as its token
 * function and treats a rejection as a refused connection.
 */
export function useLiveTicket({
  owner,
  filePath,
}: {
  owner: LightWorkspaceType;
  /** Scoped path of the file opened live. */
  filePath: string;
}): () => Promise<string> {
  const workspaceId = owner.sId;
  return useCallback(async () => {
    const response = await clientFetch(
      `/api/w/${workspaceId}/files/collab-tickets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
        } satisfies PostCollabTicketRequestBody),
      }
    );
    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      throw new Error(errorData.message);
    }
    const { ticket }: PostCollabTicketResponseBody = await response.json();
    return ticket;
  }, [workspaceId, filePath]);
}
