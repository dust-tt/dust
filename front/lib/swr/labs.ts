// LABS - CAN BE REMOVED ANYTIME

import type { WorkspaceType } from "@dust-tt/types";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";

// Transcripts
export function useLabsTranscriptsConfiguration({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const transcriptsConfigurationFetcher: Fetcher<GetLabsTranscriptsConfigurationResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/labs/transcripts`,
    transcriptsConfigurationFetcher
  );

  return {
    transcriptsConfiguration: data ? data.configuration : null,
    isTranscriptsConfigurationLoading: !error && !data,
    isTranscriptsConfigurationError: error,
    mutateTranscriptsConfiguration: mutate,
  };
}

export function useLabsTranscriptsConfigurationSaveApiConnection({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const saveApiConnection = async (
    apiKey: string,
    provider: string,
    apiKeyIsEncrypted: boolean = false
  ) => {
    const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey,
        provider,
        apiKeyIsEncrypted,
      }),
    });

    return response;
  };

  return saveApiConnection;
}
