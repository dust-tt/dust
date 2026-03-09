import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { FetchConversationParticipantsResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/participants";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fetcher } from "swr";

import { useConversations } from "./useConversations";

export function useConversationParticipants({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId?: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const { fetcher } = useFetcher();
  const conversationParticipantsFetcher: Fetcher<FetchConversationParticipantsResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/participants`
      : null,
    conversationParticipantsFetcher,
    options
  );

  return {
    conversationParticipants: useMemo(
      () => (data ? data.participants : undefined),
      [data]
    ),
    isConversationParticipantsLoading: !error && !data,
    isConversationParticipantsError: error,
    mutateConversationParticipants: mutate,
  };
}

export type ConversationParticipationOption = "join" | "leave" | "delete";

export const useConversationParticipationOptions = ({
  ownerId,
  conversationId,
  userId,
  disabled,
}: {
  ownerId: string;
  conversationId?: string | null;
  userId: string | null;
  disabled: boolean;
}) => {
  const { conversationParticipants } = useConversationParticipants({
    conversationId,
    workspaceId: ownerId,
    options: { disabled },
  });
  const [options, setOptions] = useState<ConversationParticipationOption[]>([]);

  useEffect(() => {
    if (conversationParticipants === undefined) {
      setOptions([]);
      return;
    }
    const isUserParticipating =
      userId !== null &&
      conversationParticipants?.users.find(
        (participant) => participant.sId === userId
      );

    const isLastParticipant =
      isUserParticipating && conversationParticipants?.users.length === 1;

    const isConversationCreator =
      userId !== null &&
      conversationParticipants?.users.find(
        (participant) => participant.sId === userId && participant.isCreator
      );

    if (isLastParticipant) {
      setOptions(["delete"]);
    } else if (isConversationCreator) {
      setOptions(["leave", "delete"]);
    } else if (isUserParticipating) {
      setOptions(["leave"]);
    } else {
      setOptions(["join"]);
    }
  }, [conversationParticipants, userId]);

  return options;
};

export const useJoinConversation = ({
  ownerId,
  conversationId,
}: {
  ownerId: string;
  conversationId?: string | null;
}): (() => Promise<boolean>) => {
  const sendNotification = useSendNotification();

  const { mutateConversations } = useConversations({ workspaceId: ownerId });
  const { mutateConversationParticipants } = useConversationParticipants({
    conversationId,
    workspaceId: ownerId,
    options: { disabled: true },
  });

  const joinConversation = useCallback(async (): Promise<boolean> => {
    if (!conversationId) {
      return false;
    }
    try {
      const response = await clientFetch(
        `/api/w/${ownerId}/assistant/conversations/${conversationId}/participants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (!response.ok) {
        const { error } = await response.json();
        if (error.type === "user_already_participant") {
          sendNotification({
            type: "error",
            title: "Already subscribed",
            description: "You are already a participant in this conversation.",
          });
          return false;
        }

        throw new Error("Failed to subscribe to the conversation.");
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error",
        description: "Failed to subscribe to the conversation.",
      });
      return false;
    }

    sendNotification({
      type: "success",
      title: "Subscribed!",
      description: "You have been added to this conversation.",
    });

    void mutateConversations();
    void mutateConversationParticipants();

    return true;
  }, [
    ownerId,
    sendNotification,
    mutateConversations,
    mutateConversationParticipants,
    conversationId,
  ]);

  return joinConversation;
};
