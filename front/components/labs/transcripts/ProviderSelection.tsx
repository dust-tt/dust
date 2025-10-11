import { Page } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";
import type { KeyedMutator } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import {
  useLabsTranscriptsDefaultConfiguration,
  useLabsTranscriptsIsConnectorConnected,
} from "@app/lib/swr/labs";
import datadogLogger from "@app/logger/datadogLogger";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";
import type {
  LabsTranscriptsConfigurationType,
  LabsTranscriptsProviderType,
  LightWorkspaceType,
} from "@app/types";
import { setupOAuthConnection } from "@app/types";

import { GongConnection } from "./providers/GongConnection";
import { GoogleDriveConnection } from "./providers/GoogleDriveConnection";
import { ModjoConnection } from "./providers/ModjoConnection";

interface ProviderSelectionProps {
  transcriptsConfiguration: LabsTranscriptsConfigurationType | null;
  setIsDeleteProviderDialogOpened: (isOpen: boolean) => void;
  mutateTranscriptsConfiguration:
    | (() => Promise<void>)
    | KeyedMutator<GetLabsTranscriptsConfigurationResponseBody>;
  owner: LightWorkspaceType;
}

export function ProviderSelection({
  transcriptsConfiguration,
  setIsDeleteProviderDialogOpened,
  mutateTranscriptsConfiguration,
  owner,
}: ProviderSelectionProps) {
  const sendNotification = useSendNotification();
  const [apiKey, setApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] =
    useState<LabsTranscriptsProviderType | null>(
      transcriptsConfiguration?.provider ?? null
    );

  const { isConnectorConnected: isGongConnectorConnected } =
    useLabsTranscriptsIsConnectorConnected({
      owner,
      provider: "gong",
    });

  const { defaultConfiguration: defaultModjoConfiguration } =
    useLabsTranscriptsDefaultConfiguration({
      owner,
      provider: "modjo",
    });

  const saveOAuthConnection = useCallback(
    async (
      connectionId: string | null,
      provider: string,
      useConnectorConnection?: boolean
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
            useConnectorConnection,
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
    },
    [owner.sId, sendNotification, mutateTranscriptsConfiguration]
  );

  const handleConnectGoogleTranscriptsSource = useCallback(async () => {
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

    await saveOAuthConnection(cRes.value.connection_id, "google_drive");
  }, [owner, sendNotification, saveOAuthConnection]);

  const saveApiConnection = useCallback(
    async (apiKey: string, provider: string) => {
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
    },
    [owner.sId]
  );

  const saveConnectorConnection = useCallback(
    async (provider: string) => {
      const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider, useConnectorConnection: true }),
      });
      return response;
    },
    [owner.sId]
  );

  const handleConnectGongTranscriptsSource = useCallback(async () => {
    try {
      const response = await saveConnectorConnection("gong");
      if (!response.ok) {
        const errorText = await response.text();
        datadogLogger.error(
          {
            status: response.status,
            error: errorText,
            workspaceId: owner.sId,
          },
          "[Labs Transcripts] Failed to connect Gong"
        );
        sendNotification({
          type: "error",
          title: "Failed to connect Gong",
          description: "Could not connect to Gong. Please try again.",
        });
        return;
      }

      sendNotification({
        type: "success",
        title: "Gong connected",
        description:
          "Your transcripts provider has been connected successfully.",
      });

      await mutateTranscriptsConfiguration();
    } catch (error) {
      datadogLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          workspaceId: owner.sId,
        },
        "[Labs Transcripts] Exception connecting Gong"
      );
      sendNotification({
        type: "error",
        title: "Failed to connect Gong",
        description: "Could not connect to Gong. Please try again.",
      });
    }
  }, [saveConnectorConnection, sendNotification, mutateTranscriptsConfiguration, owner.sId]);

  const handleConnectModjoTranscriptsSource = useCallback(
    async ({
      credentialId,
      defaultModjoConfiguration,
    }: {
      credentialId: string | null;
      defaultModjoConfiguration: LabsTranscriptsConfigurationType | null;
    }) => {
      try {
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
          await saveApiConnection(credentialId, "modjo");
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
    },
    [sendNotification, saveApiConnection, mutateTranscriptsConfiguration]
  );

  const renderProviderConnection = () => {
    switch (selectedProvider) {
      case "google_drive":
        return (
          <GoogleDriveConnection
            transcriptsConfiguration={transcriptsConfiguration}
            setIsDeleteProviderDialogOpened={setIsDeleteProviderDialogOpened}
            onConnect={handleConnectGoogleTranscriptsSource}
          />
        );
      case "gong":
        return (
          <GongConnection
            transcriptsConfiguration={transcriptsConfiguration}
            setIsDeleteProviderDialogOpened={setIsDeleteProviderDialogOpened}
            isGongConnectorConnected={isGongConnectorConnected}
            onConnect={handleConnectGongTranscriptsSource}
          />
        );
      case "modjo":
        return (
          <ModjoConnection
            transcriptsConfiguration={transcriptsConfiguration}
            setIsDeleteProviderDialogOpened={setIsDeleteProviderDialogOpened}
            defaultModjoConfiguration={defaultModjoConfiguration}
            apiKey={apiKey}
            setApiKey={setApiKey}
            onConnect={handleConnectModjoTranscriptsSource}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Page.Layout direction="vertical">
      <Page.SectionHeader title="Connect your transcripts provider" />
      {!transcriptsConfiguration && (
        <Page.Layout direction="horizontal" gap="xl">
          <div
            className={`cursor-pointer rounded-md border bg-white p-4 hover:border-gray-400 dark:bg-white ${
              selectedProvider == "google_drive"
                ? "border-gray-400"
                : "border-gray-200"
            }`}
            onClick={() => setSelectedProvider("google_drive")}
          >
            <img
              src="/static/labs/transcripts/google.png"
              style={{ maxHeight: "35px" }}
            />
          </div>
          <div
            className={`cursor-pointer rounded-md border bg-white p-4 hover:border-gray-400 dark:bg-white ${
              selectedProvider == "gong" ? "border-gray-400" : "border-gray-200"
            }`}
            onClick={() => setSelectedProvider("gong")}
          >
            <img
              src="/static/labs/transcripts/gong.jpeg"
              style={{ maxHeight: "35px" }}
            />
          </div>
          <div
            className={`cursor-pointer rounded-md border bg-white p-4 hover:border-gray-400 dark:bg-white ${
              selectedProvider == "modjo"
                ? "border-gray-400"
                : "border-gray-200"
            }`}
            onClick={() => setSelectedProvider("modjo")}
          >
            <img
              src="/static/labs/transcripts/modjo.png"
              style={{ maxHeight: "35px" }}
            />
          </div>
        </Page.Layout>
      )}

      {renderProviderConnection()}
    </Page.Layout>
  );
}
