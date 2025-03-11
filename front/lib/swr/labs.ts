// LABS - CAN BE REMOVED ANYTIME

import { useSendNotification } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { LabsTranscriptsProviderType } from "@dust-tt/types";
import { setupOAuthConnection } from "@dust-tt/types";
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

export function useLabsTranscriptsDefaultConfiguration({
  owner,
  provider,
}: {
  owner: WorkspaceType;
  provider: string;
}) {
  const defaultConfigurationFetcher: Fetcher<GetLabsTranscriptsConfigurationResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/labs/transcripts/default?provider=${provider}`,
    defaultConfigurationFetcher
  );

  return {
    defaultConfiguration: data ? data.configuration : null,
    isDefaultConfigurationLoading: !error && !data,
    isDefaultConfigurationError: error,
    mutateDefaultConfiguration: mutate,
  };
}

export function useLabsTranscriptsIsConnectorConnected({
  owner,
  provider,
}: {
  owner: WorkspaceType;
  provider: string;
}) {
  const isConnectorConnectedFetcher: Fetcher<boolean> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/labs/transcripts/connector?provider=${provider}`,
    isConnectorConnectedFetcher
  );

  return {
    isConnectorConnected: data ?? false,
    isConnectorConnectedLoading: !error && !data,
    isConnectorConnectedError: error,
    mutateIsConnectorConnected: mutate,
  };
}

export function useLabsProviderConnections({
  owner,
  mutateTranscriptsConfiguration,
}: {
  owner: WorkspaceType;
  mutateTranscriptsConfiguration: () => Promise<any>;
}) {
  const sendNotification = useSendNotification();

  const saveApiConnection = async (apiKey: string, provider: string) => {
    const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey,
        provider,
      }),
    });

    return response;
  };

  const saveOAuthConnection = async (
    connectionId: string,
    provider: string
  ) => {
    try {
      const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId,
          provider,
        }),
      });
      if (!response.ok) {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description:
            "Could not connect to your transcripts provider. Please try again.",
        });
      } else {
        sendNotification({
          type: "success",
          title: "Provider connected",
          description:
            "Your transcripts provider has been connected successfully.",
        });

        await mutateTranscriptsConfiguration();
      }
      return response;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect provider",
        description:
          "Unexpected error trying to connect to your transcripts provider. Please try again. Error: " +
          error,
      });
    }
  };

  const handleConnectGoogleTranscriptsSource = async (
    provider: LabsTranscriptsProviderType | null
  ) => {
    if (provider !== "google_drive") {
      return;
    }

    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider: "google_drive",
      useCase: "labs_transcripts",
      extraConfig: {},
    });

    if (cRes.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to connect Google Drive",
        description: cRes.error.message,
      });
      return;
    }

    await saveOAuthConnection(cRes.value.connection_id, provider);
  };

  const handleConnectModjoTranscriptsSource = async ({
    provider,
    credentialId,
    defaultModjoConfiguration,
  }: {
    provider: LabsTranscriptsProviderType | null;
    credentialId: string | null;
    defaultModjoConfiguration: any | null;
  }) => {
    try {
      if (provider !== "modjo") {
        return;
      }

      if (defaultModjoConfiguration) {
        if (
          defaultModjoConfiguration.provider !== "modjo" ||
          !defaultModjoConfiguration.credentialId
        ) {
          sendNotification({
            type: "error",
            title: "Failed to connect Modjo",
            description:
              "Your workspace is already connected to another provider by default.",
          });
          return;
        }

        await saveApiConnection(
          defaultModjoConfiguration.credentialId,
          defaultModjoConfiguration.provider
        );
      } else {
        if (!credentialId) {
          sendNotification({
            type: "error",
            title: "Modjo API key is required",
            description: "Please enter your Modjo API key.",
          });
          return;
        }
        await saveApiConnection(credentialId, provider);
      }

      sendNotification({
        type: "success",
        title: "Modjo connected",
        description:
          "Your transcripts provider has been connected successfully.",
      });

      await mutateTranscriptsConfiguration();
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect Modjo",
        description: "Could not connect to Modjo. Please try again.",
      });
    }
  };

  const handleDisconnectProvider = async (
    transcriptConfigurationId: number
  ) => {
    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to disconnect provider",
        description:
          "Could not disconnect from your transcripts provider. Please try again.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Provider disconnected",
        description:
          "Your transcripts provider has been disconnected successfully.",
      });

      await mutateTranscriptsConfiguration();
    }

    return response;
  };

  return {
    handleConnectGoogleTranscriptsSource,
    handleConnectModjoTranscriptsSource,
    handleDisconnectProvider,
  };
}
