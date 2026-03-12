import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import type { GetGlobalAgentFeedbacksResponseBody } from "@app/pages/api/poke/global-agent-feedbacks";
import type { Fetcher } from "swr";
import useSWR from "swr";

export function usePokeGlobalAgentFeedbacks({
  includeEmpty,
  lastId,
}: {
  includeEmpty: boolean;
  lastId: number | null;
}) {
  const { fetcher } = useFetcher();
  const feedbacksFetcher: Fetcher<GetGlobalAgentFeedbacksResponseBody> =
    fetcher;

  const params = new URLSearchParams();
  if (includeEmpty) {
    params.set("includeEmpty", "true");
  }
  if (lastId !== null) {
    params.set("lastId", String(lastId));
  }

  const key = `/api/poke/global-agent-feedbacks?${params.toString()}`;

  const { data, error } = useSWR(key, feedbacksFetcher);

  return {
    feedbacks: data?.feedbacks ?? emptyArray(),
    hasMore: data?.hasMore ?? false,
    isLoading: !error && !data,
    isError: error,
  };
}
