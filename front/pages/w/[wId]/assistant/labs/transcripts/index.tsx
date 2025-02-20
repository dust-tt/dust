import {
  BookOpenIcon,
  Button,
  ChatBubbleThoughtIcon,
  CloudArrowLeftRightIcon,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Page,
  SliderToggle,
  Spinner,
  useSendNotification,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LabsTranscriptsProviderType,
  LightAgentConfigurationType,
  SubscriptionType,
  WhitelistableFeature,
  WorkspaceType,
} from "@dust-tt/types";
import { setupOAuthConnection } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import {
  useLabsTranscriptsConfiguration,
  useLabsTranscriptsDefaultConfiguration,
} from "@app/lib/swr/labs";
import { useSpaces } from "@app/lib/swr/spaces";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";

const defaultTranscriptConfigurationState = {
  provider: "",
  isGDriveConnected: false,
  isGongConnected: false,
  isModjoConnected: false,
  assistantSelected: null,
  isActive: false,
  dataSourceView: null,
  credentialId: null,
  hasDefaultConfiguration: false,
};

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSourcesViews: DataSourceViewType[];
  hasDefaultStorageConfiguration: boolean;
  featureFlags: WhitelistableFeature[];
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  const dataSourcesViews = (
    await DataSourceViewResource.listByWorkspace(auth)
  ).map((dsv) => dsv.toJSON());

  const defaultStorageConfiguration =
    await LabsTranscriptsConfigurationResource.fetchDefaultFullStorageConfigurationForWorkspace(
      auth
    );
  const hasDefaultStorageConfiguration = !!defaultStorageConfiguration?.id;

  if (!owner || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("labs_transcripts")) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
      dataSourcesViews,
      hasDefaultStorageConfiguration,
      featureFlags,
    },
  };
});

export default function LabsTranscriptsIndex({
  owner,
  subscription,
  dataSourcesViews,
  hasDefaultStorageConfiguration,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useSendNotification();
  const {
    transcriptsConfiguration,
    isTranscriptsConfigurationLoading,
    mutateTranscriptsConfiguration,
  } = useLabsTranscriptsConfiguration({ workspaceId: owner.sId });
  const [isDeleteProviderDialogOpened, setIsDeleteProviderDialogOpened] =
    useState(false);
  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});
  const [storeInFolder, setStoreInFolder] = useState(false);
  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
  });
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

  const { defaultConfiguration: defaultModjoConfiguration } =
    useLabsTranscriptsDefaultConfiguration({
      owner,
      provider: "modjo",
    });

  const { defaultConfiguration: defaultGongConfiguration } =
    useLabsTranscriptsDefaultConfiguration({
      owner,
      provider: "gong",
    });

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

  const handleSetStoreInFolder: Dispatch<SetStateAction<boolean>> = async (
    newValue
  ) => {
    if (!newValue && transcriptsConfiguration) {
      await handleSetDataSource(transcriptsConfiguration.id, null);
      setSelectionConfigurations({});
    }
    setStoreInFolder(newValue);
  };

  const handleSetSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  > = async (newValue) => {
    if (!transcriptsConfiguration) {
      return;
    }

    const newSelectionConfigurations =
      typeof newValue === "function"
        ? newValue(selectionConfigurations)
        : newValue;

    const keys = Object.keys(newSelectionConfigurations);

    if (keys.length === 0) {
      return;
    }

    const lastKey = keys[keys.length - 1];

    // If there's no change in the selection, return early
    if (
      lastKey &&
      JSON.stringify(selectionConfigurations[lastKey]) ===
        JSON.stringify(newSelectionConfigurations[lastKey])
    ) {
      return;
    }

    setSelectionConfigurations(
      lastKey ? { [lastKey]: newSelectionConfigurations[lastKey] } : {}
    );

    if (lastKey) {
      const datasourceView = newSelectionConfigurations[lastKey].dataSourceView;
      await handleSetDataSource(transcriptsConfiguration.id, datasourceView);
    }
  };

  const [transcriptsConfigurationState, setTranscriptsConfigurationState] =
    useState<{
      provider: string;
      isGDriveConnected: boolean;
      isGongConnected: boolean;
      isModjoConnected: boolean;
      assistantSelected: LightAgentConfigurationType | null;
      isActive: boolean;
      dataSourceView: DataSourceViewType | null;
      credentialId: string | null;
      hasDefaultConfiguration: boolean;
    }>(defaultTranscriptConfigurationState);

  useEffect(() => {
    if (transcriptsConfiguration) {
      if (transcriptsConfiguration.dataSourceViewId) {
        const dataSourceView = dataSourcesViews.find(
          (ds) => ds.id === transcriptsConfiguration.dataSourceViewId
        );
        if (dataSourceView) {
          setSelectionConfigurations({
            [dataSourceView.sId]: {
              dataSourceView,
              selectedResources: [],
              isSelectAll: true,
              tagsFilter: null, // No tags filters for transcripts.
            },
          });
        }
      }
      setStoreInFolder(!!transcriptsConfiguration.dataSourceViewId);
      setTranscriptsConfigurationState((prev) => {
        return {
          ...prev,
          provider: transcriptsConfiguration.provider || "",
          isGongConnected:
            transcriptsConfiguration.provider === "gong" || false,
          isModjoConnected:
            transcriptsConfiguration.provider === "modjo" || false,
          isGDriveConnected:
            transcriptsConfiguration.provider === "google_drive" || false,
          assistantSelected:
            agentConfigurations.find(
              (a) => a.sId === transcriptsConfiguration.agentConfigurationId
            ) || null,
          isActive: transcriptsConfiguration.isActive || false,
          dataSourceView:
            dataSourcesViews.find(
              (ds) => ds.id === transcriptsConfiguration.dataSourceViewId
            ) || null,
        };
      });
    } else {
      setTranscriptsConfigurationState(() => {
        return defaultTranscriptConfigurationState;
      });
    }
  }, [transcriptsConfiguration, agentConfigurations, dataSourcesViews]);

  if (isTranscriptsConfigurationLoading) {
    return <Spinner />;
  }

  const agents = agentConfigurations.filter((a) => a.status === "active");

  const handleProviderChange = async (
    provider: LabsTranscriptsProviderType
  ) => {
    let hasDefaultConfiguration = false;
    if (provider === "modjo" && defaultModjoConfiguration) {
      hasDefaultConfiguration = true;
    }

    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        provider,
        hasDefaultConfiguration,
      };
    });
    await mutateTranscriptsConfiguration();
  };

  const makePatchRequest = async (
    transcriptConfigurationId: number,
    data: Partial<PatchTranscriptsConfiguration>,
    successMessage: string
  ) => {
    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to update",
        description: "Could not update the configuration. Please try again.",
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Success!",
      description: successMessage,
    });

    await mutateTranscriptsConfiguration();
  };

  const updateAssistant = async (
    transcriptsConfigurationId: number,
    assistant: LightAgentConfigurationType
  ) => {
    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        assistantSelected: assistant,
      };
    });

    const successMessage =
      "The agent that will help you summarize your transcripts has been set to @" +
      assistant.name;
    await makePatchRequest(
      transcriptsConfigurationId,
      {
        isActive: transcriptsConfigurationState.isActive,
        agentConfigurationId: assistant.sId,
      },
      successMessage
    );
  };

  const updateIsActive = async (
    transcriptsConfigurationId: number,
    isActive: boolean
  ) => {
    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        isActive,
      };
    });

    const successMessage = isActive
      ? "We will start summarizing your meeting transcripts."
      : "We will no longer summarize your meeting transcripts.";
    await makePatchRequest(
      transcriptsConfigurationId,
      {
        isActive,
      },
      successMessage
    );
  };

  const handleSelectAssistant = async (
    transcriptConfigurationId: number,
    assistant: LightAgentConfigurationType
  ) => {
    return updateAssistant(transcriptConfigurationId, assistant);
  };

  const handleSetDataSource = async (
    transcriptConfigurationId: number,
    dataSourceView: DataSourceViewType | null
  ) => {
    setTranscriptsConfigurationState((prev) => {
      return {
        ...prev,
        dataSourceView,
      };
    });

    let successMessage = "The transcripts will not be stored.";

    if (dataSourceView) {
      successMessage =
        "The transcripts will be stored in the folder " +
        dataSourceView.dataSource.name;
    } else {
      successMessage = "The transcripts will not be stored.";
    }

    await makePatchRequest(
      transcriptConfigurationId,
      {
        dataSourceViewId: dataSourceView ? dataSourceView.sId : null,
      },
      successMessage
    );
  };

  const handleSetIsActive = async (
    transcriptConfigurationId: number,
    isActive: boolean
  ) => {
    return updateIsActive(transcriptConfigurationId, isActive);
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

  const handleConnectGoogleTranscriptsSource = async () => {
    if (transcriptsConfigurationState.provider !== "google_drive") {
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

    await saveOAuthConnection(
      cRes.value.connection_id,
      transcriptsConfigurationState.provider
    );
  };

  const handleConnectGongTranscriptsSource = async () => {
    try {
      if (transcriptsConfigurationState.provider !== "gong") {
        return;
      }

      if (defaultGongConfiguration) {
        if (
          defaultGongConfiguration.provider !== "gong" ||
          !defaultGongConfiguration.connectionId
        ) {
          sendNotification({
            type: "error",
            title: "Failed to connect Gong",
            description:
              "Your workspace is already connected to another provider",
          });
          return;
        }

        await saveOAuthConnection(
          defaultGongConfiguration.connectionId,
          transcriptsConfigurationState.provider
        );

        return;
      } else {
        const cRes = await setupOAuthConnection({
          dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
          owner,
          provider: "gong",
          useCase: "connection",
          extraConfig: {},
        });
        if (!cRes.isOk()) {
          return cRes;
        }
        const connectionId = cRes.value.connection_id;

        await saveOAuthConnection(
          connectionId,
          transcriptsConfigurationState.provider
        );
      }
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect Gong",
        description: "Could not connect to Gong. Please try again.",
      });
    }
  };

  const handleConnectModjoTranscriptsSource = async () => {
    try {
      if (transcriptsConfigurationState.provider !== "modjo") {
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
        if (!transcriptsConfigurationState.credentialId) {
          sendNotification({
            type: "error",
            title: "Modjo API key is required",
            description: "Please enter your Modjo API key.",
          });
          return;
        }
        await saveApiConnection(
          transcriptsConfigurationState.credentialId,
          transcriptsConfigurationState.provider
        );
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

  const handleDisconnectProvider = async () => {
    if (!transcriptsConfiguration) {
      return;
    }

    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptsConfiguration.id}`,
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

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Transcripts processing"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Dialog
          open={isDeleteProviderDialogOpened}
          onOpenChange={(open) => {
            if (!open) {
              setIsDeleteProviderDialogOpened(false);
            }
          }}
        >
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Disconnect transcripts provider</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              This will stop the processing of your meeting transcripts and
              delete all history. You can reconnect anytime.
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Ok",
                variant: "warning",
                onClick: async () => {
                  await handleDisconnectProvider();
                  setIsDeleteProviderDialogOpened(false);
                },
              }}
            />
          </DialogContent>
        </Dialog>
        <Page>
          <Page.Header
            title="Meeting transcripts processing"
            icon={BookOpenIcon}
            description="Receive meeting minutes processed by email automatically and store them in a Dust Folder."
          />
          <Page.Layout direction="vertical">
            <Page.SectionHeader title="Connect your transcripts provider" />
            {!transcriptsConfiguration && (
              <Page.Layout direction="horizontal" gap="xl">
                <div
                  className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
                    transcriptsConfigurationState.provider == "google_drive"
                      ? "border-gray-400"
                      : "border-gray-200"
                  }`}
                  onClick={() => handleProviderChange("google_drive")}
                >
                  <img
                    src="/static/labs/transcripts/google.png"
                    style={{ maxHeight: "35px" }}
                  />
                </div>
                <div
                  className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
                    transcriptsConfigurationState.provider == "gong"
                      ? "border-gray-400"
                      : "border-gray-200"
                  }`}
                  onClick={() => handleProviderChange("gong")}
                >
                  <img
                    src="/static/labs/transcripts/gong.jpeg"
                    style={{ maxHeight: "35px" }}
                  />
                </div>
                <div
                  className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
                    transcriptsConfigurationState.provider == "modjo"
                      ? "border-gray-400"
                      : "border-gray-200"
                  }`}
                  onClick={() => handleProviderChange("modjo")}
                >
                  <img
                    src="/static/labs/transcripts/modjo.png"
                    style={{ maxHeight: "35px" }}
                  />
                </div>
              </Page.Layout>
            )}

            {transcriptsConfigurationState.provider === "google_drive" && (
              <Page.Layout direction="vertical">
                {transcriptsConfigurationState.isGDriveConnected ? (
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
                      Connect to Google Drive so Dust can access 'My Drive'
                      where your meeting transcripts are stored.
                    </Page.P>
                    <div>
                      <Button
                        label="Connect Google"
                        size="sm"
                        icon={CloudArrowLeftRightIcon}
                        onClick={async () => {
                          await handleConnectGoogleTranscriptsSource();
                        }}
                      />
                    </div>
                  </>
                )}
              </Page.Layout>
            )}
            {transcriptsConfigurationState.provider === "gong" && (
              <Page.Layout direction="vertical">
                {transcriptsConfigurationState.isGongConnected ? (
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
                      Connect to Gong so Dust can access your meeting
                      transcripts.
                    </Page.P>
                    <div>
                      <Button
                        label="Connect Gong"
                        size="sm"
                        icon={CloudArrowLeftRightIcon}
                        onClick={async () => {
                          await handleConnectGongTranscriptsSource();
                        }}
                      />
                    </div>
                  </>
                )}
              </Page.Layout>
            )}
            {transcriptsConfigurationState.provider === "modjo" && (
              <Page.Layout direction="vertical">
                {transcriptsConfigurationState.isModjoConnected ? (
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
                      Connect to Modjo so Dust can access your meeting
                      transcripts.
                    </Page.P>
                    <div className="flex gap-2">
                      {!transcriptsConfigurationState.hasDefaultConfiguration && (
                        <Input
                          placeholder="Modjo API key"
                          value={transcriptsConfigurationState.credentialId}
                          onChange={(e) =>
                            setTranscriptsConfigurationState({
                              ...transcriptsConfigurationState,
                              credentialId: e.target.value,
                            })
                          }
                        />
                      )}
                      <Button
                        label="Connect Modjo"
                        size="sm"
                        icon={CloudArrowLeftRightIcon}
                        onClick={async () => {
                          await handleConnectModjoTranscriptsSource();
                        }}
                      />
                    </div>
                  </>
                )}
              </Page.Layout>
            )}
          </Page.Layout>
          {transcriptsConfiguration &&
            (transcriptsConfigurationState.isGDriveConnected ||
              transcriptsConfigurationState.isGongConnected ||
              transcriptsConfigurationState.isModjoConnected) && (
              <>
                {(!hasDefaultStorageConfiguration ||
                  (hasDefaultStorageConfiguration &&
                    transcriptsConfiguration.isDefaultFullStorage)) && (
                  <Page.Layout direction="vertical">
                    <Page.SectionHeader
                      title="Store transcripts"
                      description="After each transcribed meeting, store the full transcript in a Dust folder for later use."
                    />
                    {transcriptsConfiguration.isDefaultFullStorage && (
                      <ContentMessage
                        title="Default storage"
                        variant="slate"
                        size="lg"
                        icon={ChatBubbleThoughtIcon}
                      >
                        Your configuration handles the storage of all your
                        workspace's transcripts. Other users will not have the
                        possibility to store their own transcripts.
                      </ContentMessage>
                    )}
                    <Page.Layout direction="horizontal" gap="xl">
                      <SliderToggle
                        selected={storeInFolder}
                        onClick={() => handleSetStoreInFolder(!storeInFolder)}
                      />
                      <Page.P>Enable transcripts storage</Page.P>
                    </Page.Layout>
                    <Page.Layout direction="horizontal">
                      <div className="w-full">
                        <div className="overflow-x-auto">
                          {!isSpacesLoading &&
                            storeInFolder &&
                            selectionConfigurations && (
                              <DataSourceViewsSpaceSelector
                                useCase="transcriptsProcessing"
                                dataSourceViews={dataSourcesViews}
                                allowedSpaces={spaces}
                                owner={owner}
                                selectionConfigurations={
                                  selectionConfigurations
                                }
                                setSelectionConfigurations={
                                  handleSetSelectionConfigurations
                                }
                                viewType="documents"
                                isRootSelectable={true}
                              />
                            )}
                        </div>
                      </div>
                    </Page.Layout>
                  </Page.Layout>
                )}
                <Page.Layout direction="vertical">
                  <Page.SectionHeader
                    title="Process transcripts automatically"
                    description="After each transcribed meeting, Dust will run the agent you selected and send you the result by email."
                  />
                  <Page.Layout direction="vertical">
                    <Page.Layout direction="vertical">
                      <Page.Layout direction="horizontal">
                        <AssistantPicker
                          owner={owner}
                          size="sm"
                          onItemClick={(assistant) =>
                            handleSelectAssistant(
                              transcriptsConfiguration.id,
                              assistant
                            )
                          }
                          assistants={agents}
                          showFooterButtons={false}
                        />
                        {transcriptsConfigurationState.assistantSelected && (
                          <div className="mt-2">
                            <Page.P>
                              <strong>
                                @
                                {
                                  transcriptsConfigurationState
                                    .assistantSelected.name
                                }
                              </strong>
                            </Page.P>
                          </div>
                        )}
                        <div className="mt-2">
                          <Page.P>
                            The agent that will process the transcripts received
                            from{" "}
                            {transcriptsConfigurationState.provider
                              .charAt(0)
                              .toUpperCase() +
                              transcriptsConfigurationState.provider.slice(1)}
                            .
                          </Page.P>
                        </div>
                      </Page.Layout>
                    </Page.Layout>
                  </Page.Layout>
                  <Page.Layout direction="horizontal" gap="xl">
                    <SliderToggle
                      selected={transcriptsConfigurationState.isActive}
                      onClick={() =>
                        handleSetIsActive(
                          transcriptsConfiguration.id,
                          !transcriptsConfigurationState.isActive
                        )
                      }
                      disabled={
                        !transcriptsConfigurationState.assistantSelected
                      }
                    />
                    <Page.P>Enable transcripts email processing</Page.P>
                  </Page.Layout>
                </Page.Layout>
              </>
            )}
        </Page>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
