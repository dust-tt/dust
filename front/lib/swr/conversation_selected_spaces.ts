import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  ConversationSelectedSpacesResponse,
  SelectableConversationSpaceType,
} from "@app/types/assistant/conversation";
import { SPACE_KINDS } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";
import { z } from "zod";

type GetSelectableConversationSpacesResponseBody = {
  spaces: SelectableConversationSpaceType[];
};

const ConversationSelectedSpacesResponseSchema = z.object({
  selectedSpaces: z.array(
    z.object({
      createdAt: z.number(),
      groupIds: z.array(z.string()),
      isRestricted: z.boolean(),
      kind: z.enum(SPACE_KINDS),
      managementMode: z.enum(["manual", "group"]),
      name: z.string(),
      sId: z.string(),
      selected: z.boolean(),
      updatedAt: z.number(),
    })
  ),
  effectiveAcl: z.object({
    spaceIds: z.array(z.string()),
    viewerMustHaveAll: z.literal(true),
  }),
}) satisfies z.ZodType<ConversationSelectedSpacesResponse>;

export function useSelectableConversationSpaces({
  conversationId,
  disabled,
  owner,
}: {
  conversationId: string | null;
  disabled?: boolean;
  owner: WorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const selectableSpacesFetcher: Fetcher<GetSelectableConversationSpacesResponseBody> =
    fetcher;

  const url = conversationId
    ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/selectable_spaces`
    : null;

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    selectableSpacesFetcher,
    {
      disabled: disabled === true || conversationId === null,
    }
  );

  const spaces = useMemo(
    () => data?.spaces ?? emptyArray<SelectableConversationSpaceType>(),
    [data?.spaces]
  );

  return {
    spaces,
    isSelectableSpacesLoading: !disabled && !error && !data && !!conversationId,
    isSelectableSpacesError: error,
    mutateSelectableSpaces: mutate,
  };
}

export function useAddConversationSelectedSpaces({
  conversationId,
  owner,
}: {
  conversationId: string | null;
  owner: WorkspaceType;
}) {
  const sendNotification = useSendNotification();

  return useCallback(
    async (
      spaceIds: string[]
    ): Promise<ConversationSelectedSpacesResponse | null> => {
      if (!conversationId || spaceIds.length === 0) {
        return null;
      }

      const response = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/selected_spaces`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mode: "add", spaceIds }),
        }
      );

      if (!response.ok) {
        const errorData = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Could not select Spaces",
          description: errorData.message,
        });
        return null;
      }

      return ConversationSelectedSpacesResponseSchema.parse(
        await response.json()
      );
    },
    [conversationId, owner.sId, sendNotification]
  );
}
