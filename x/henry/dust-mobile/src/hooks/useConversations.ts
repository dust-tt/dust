import useSWR from "swr";
import { useDustAPI } from "./useDustAPI";
import { useCallback } from "react";
import { useAppStateRevalidation, swrConfig } from "../lib/swr";

export function useConversations() {
  const dustAPI = useDustAPI();

  const { data, error, isLoading, mutate } = useSWR(
    "conversations",
    async () => {
      const result = await dustAPI.getConversations();
      if (result.isErr()) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    swrConfig
  );

  const revalidate = useCallback(() => {
    mutate();
  }, [mutate]);

  useAppStateRevalidation(revalidate);

  return {
    conversations: data ?? [],
    isLoading,
    error,
    mutate,
  };
}
