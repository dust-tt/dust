import {
  Button,
  CloudArrowLeftRightIcon,
  Input,
  Page,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  LabsTranscriptsConfigurationType,
  LabsTranscriptsProviderType,
  WorkspaceType,
} from "@dust-tt/types";
import { setupOAuthConnection } from "@dust-tt/types";
import { useState } from "react";
import type { KeyedMutator } from "swr";

import {
  useLabsTranscriptsDefaultConfiguration,
  useLabsTranscriptsIsConnectorConnected,
} from "@app/lib/swr/labs";
import type { GetLabsTranscriptsConfigurationResponseBody } from "@app/pages/api/w/[wId]/labs/transcripts";

interface ProviderSelectionProps {
  transcriptsConfiguration: LabsTranscriptsConfigurationType;
  setIsDeleteProviderDialogOpened: (isOpen: boolean) => void;
  mutateTranscriptsConfiguration:
    | (() => Promise<void>)
    | KeyedMutator<GetLabsTranscriptsConfigurationResponseBody>;
  owner: WorkspaceType;
}

export function ProviderSelection({
  transcriptsConfiguration,
  setIsDeleteProviderDialogOpened,
  mutateTranscriptsConfiguration,
  owner,
}: ProviderSelectionProps) {
  const sendNotification = useSendNotification();
  const [modjoApiKey, setModjoApiKey] = useState("");

  const { isConnectorConnected: isGongConnectorConnected } =
    useLabsTranscriptsIsConnectorConnected({
      owner,
      provider: "gong",
    });

  const saveOAuthConnection = async (
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
  };

  const handleConnectGoogleTranscriptsSource = async () => {
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
  };

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

  const saveConnectorConnection = async (provider: string) => {
    const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
      method: "POST",
      body: JSON.stringify({ provider, useConnectorConnection: true }),
    });
    return response;
  };

  const handleConnectModjoTranscriptsSource = async ({
    credentialId,
    defaultModjoConfiguration,
  }: {
    credentialId: string | null;
    defaultModjoConfiguration: any | null;
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
  };

  const { defaultConfiguration: defaultModjoConfiguration } =
    useLabsTranscriptsDefaultConfiguration({
      owner,
      provider: "modjo",
    });

  const [selectedProvider, setSelectedProvider] =
    useState<LabsTranscriptsProviderType | null>(
      transcriptsConfiguration?.provider ?? null
    );

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

      {/* Provider specific connection sections */}
      {renderProviderConnection()}
    </Page.Layout>
  );

  function renderProviderConnection() {
    switch (selectedProvider) {
      case "google_drive":
        return renderGoogleDriveConnection();
      case "gong":
        return renderGongConnection();
      case "modjo":
        return renderModjoConnection();
      default:
        return null;
    }
  }

  function renderGoogleDriveConnection() {
    return (
      <Page.Layout direction="vertical">
        {transcriptsConfiguration ? (
          <Page.Layout direction="horizontal">
            <Button
              label="Google connected"
              size="sm"
              icon={CloudArrowLeftRightIcon}
              disabled={true}
            />
            <Button
              label="Disconnect"
              icon={XMarkIcon}
              size="sm"
              variant="outline"
              onClick={() => setIsDeleteProviderDialogOpened(true)}
            />
          </Page.Layout>
        ) : (
          <>
            <Page.P>
              Connect to Google Drive so Dust can access 'My Drive' where your
              meeting transcripts are stored.
            </Page.P>
            <div>
              <Button
                label="Connect Google"
                size="sm"
                icon={CloudArrowLeftRightIcon}
                onClick={() => handleConnectGoogleTranscriptsSource()}
              />
            </div>
          </>
        )}
      </Page.Layout>
    );
  }

  function renderGongConnection() {
    return (
      <Page.Layout direction="vertical">
        {isGongConnectorConnected ? (
          <>
            {transcriptsConfiguration ? (
              <Page.Layout direction="horizontal">
                <Button
                  label="Gong connected"
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  disabled={true}
                />
                <Button
                  label="Disconnect"
                  icon={XMarkIcon}
                  size="sm"
                  variant="outline"
                  onClick={() => setIsDeleteProviderDialogOpened(true)}
                />
              </Page.Layout>
            ) : (
              <>
                <Page.P>
                  The Gong connection is active on your workspace.
                </Page.P>
                <div>
                  <Button
                    label="Process your Gong transcripts"
                    size="sm"
                    icon={CloudArrowLeftRightIcon}
                    onClick={() => saveConnectorConnection("gong")}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <Page.P>
              Please connect to Gong in the Connection Admin section so Dust can
              access your meeting transcripts before processing them.
            </Page.P>
          </>
        )}
      </Page.Layout>
    );
  }

  function renderModjoConnection() {
    return (
      <Page.Layout direction="vertical">
        {transcriptsConfiguration ? (
          <Page.Layout direction="horizontal">
            <Button
              label="Modjo connected"
              size="sm"
              icon={CloudArrowLeftRightIcon}
              disabled={true}
            />
            <Button
              label="Disconnect"
              icon={XMarkIcon}
              size="sm"
              variant="outline"
              onClick={() => setIsDeleteProviderDialogOpened(true)}
            />
          </Page.Layout>
        ) : (
          <>
            <Page.P>
              Connect to Modjo so Dust can access your meeting transcripts.
            </Page.P>
            <div className="flex gap-2">
              {!transcriptsConfiguration?.isDefaultFullStorage && (
                <Input
                  placeholder="Modjo API key"
                  value={modjoApiKey}
                  onChange={(e) => setModjoApiKey(e.target.value)}
                />
              )}
              <Button
                label="Connect Modjo"
                size="sm"
                icon={CloudArrowLeftRightIcon}
                onClick={() =>
                  handleConnectModjoTranscriptsSource({
                    credentialId: modjoApiKey,
                    defaultModjoConfiguration: defaultModjoConfiguration,
                  })
                }
              />
            </div>
          </>
        )}
      </Page.Layout>
    );
  }
}
