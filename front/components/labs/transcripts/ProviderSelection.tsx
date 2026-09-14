import { useSendNotification } from "@app/hooks/useNotification";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/lib/api/labs/transcripts";
import { useCellContext } from "@app/lib/auth/CellContext";
import { clientFetch } from "@app/lib/egress/client";
import { useLabsTranscriptsIsConnectorConnected } from "@app/lib/swr/labs";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  LabsTranscriptsConfigurationType,
  LabsTranscriptsProviderType,
} from "@app/types/labs";
import { setupOAuthConnection } from "@app/types/oauth/client/setup";
import type { LightWorkspaceType } from "@app/types/user";
import { Page } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";
import type { KeyedMutator } from "swr";

import { GongConnection } from "./providers/GongConnection";
import { GoogleDriveConnection } from "./providers/GoogleDriveConnection";

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
  const cellContext = useCellContext();
  const [selectedProvider, setSelectedProvider] =
    useState<LabsTranscriptsProviderType | null>(
      transcriptsConfiguration?.provider ?? null
    );

  const { isConnectorConnected: isGongConnectorConnected } =
    useLabsTranscriptsIsConnectorConnected({
      owner,
      provider: "gong",
    });

  const saveOAuthConnection = useCallback(
    async (
      connectionId: string | null,
      provider: string,
      useConnectorConnection?: boolean
    ) => {
      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/labs/transcripts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              connectionId,
              provider,
              useConnectorConnection,
            }),
          }
        );
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
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            error,
        });
      }
    },
    [owner.sId, sendNotification, mutateTranscriptsConfiguration]
  );

  const handleConnectGoogleTranscriptsSource = useCallback(async () => {
    const cRes = await setupOAuthConnection({
      owner,
      provider: "google_drive",
      useCase: "labs_transcripts",
      extraConfig: {},
      cellInfo: cellContext.cellInfo,
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
  }, [owner, sendNotification, saveOAuthConnection, cellContext.cellInfo]);

  const saveConnectorConnection = useCallback(
    async (provider: string) => {
      const response = await clientFetch(
        `/api/w/${owner.sId}/labs/transcripts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider, useConnectorConnection: true }),
        }
      );
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
            statusCode: response.status,
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
  }, [
    saveConnectorConnection,
    sendNotification,
    mutateTranscriptsConfiguration,
    owner.sId,
  ]);

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
            className={`cursor-pointer rounded-md border bg-white p-4 hover:border-border-dark ${
              selectedProvider == "google_drive"
                ? "border-border-dark"
                : "border-border"
            }`}
            onClick={() => setSelectedProvider("google_drive")}
          >
            <img
              src="/static/labs/transcripts/google.png"
              style={{ maxHeight: "35px" }}
            />
          </div>
          <div
            className={`cursor-pointer rounded-md border bg-white p-4 hover:border-border-dark ${
              selectedProvider == "gong"
                ? "border-border-dark"
                : "border-border"
            }`}
            onClick={() => setSelectedProvider("gong")}
          >
            <img
              src="/static/labs/transcripts/gong.jpeg"
              style={{ maxHeight: "35px" }}
            />
          </div>
        </Page.Layout>
      )}

      {renderProviderConnection()}
    </Page.Layout>
  );
}
