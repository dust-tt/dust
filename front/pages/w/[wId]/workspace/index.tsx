import {
  ArrowPathIcon,
  Button,
  ContextItem,
  DocumentTextIcon,
  GlobeAltIcon,
  Input,
  MicIcon,
  MicrosoftLogo,
  Page,
  PencilSquareIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SlackLogo,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";

import { updateConnectorConnectionId } from "@app/components/data_source/ConnectorPermissionsModal";
import { subNavigationAdmin } from "@app/components/navigation/config";
import { setupConnection } from "@app/components/spaces/AddConnectionMenu";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ProviderManagementModal } from "@app/components/workspace/ProviderManagementModal";
import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
import { useSendNotification } from "@app/hooks/useNotification";
import { useVoiceTranscriptionToggle } from "@app/hooks/useVoiceTranscriptionToggle";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useConnectorConfig, useToggleChatBot } from "@app/lib/swr/connectors";
import logger from "@app/logger/logger";
import type { PostDataSourceRequestBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";
import type {
  DataSourceType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";
import { ConnectorsAPI } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isSlackDataSourceBotEnabled: boolean;
  slackBotDataSource: DataSourceType | null;
  microsoftBotDataSource: DataSourceType | null;
  systemSpace: SpaceType;
}>(async (_, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isAdmin() || !subscription) {
    return {
      notFound: true,
    };
  }

  const [[slackDataSource], [slackBotDataSource], [microsoftBotDataSource]] =
    await Promise.all([
      DataSourceResource.listByConnectorProvider(auth, "slack"),
      DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
      DataSourceResource.listByConnectorProvider(auth, "microsoft_bot"),
    ]);

  let isSlackDataSourceBotEnabled = false;
  if (slackDataSource && slackDataSource.connectorId) {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const configRes = await connectorsAPI.getConnectorConfig(
      slackDataSource.connectorId,
      "botEnabled"
    );
    if (configRes.isOk()) {
      isSlackDataSourceBotEnabled = configRes.value.configValue === "true";
    }
  }

  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

  return {
    props: {
      owner,
      subscription,
      isSlackDataSourceBotEnabled,
      slackBotDataSource: slackBotDataSource?.toJSON() ?? null,
      microsoftBotDataSource: microsoftBotDataSource?.toJSON() ?? null,
      systemSpace: systemSpace.toJSON(),
    },
  };
});

export default function WorkspaceAdmin({
  owner,
  subscription,
  isSlackDataSourceBotEnabled,
  slackBotDataSource,
  microsoftBotDataSource,
  systemSpace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState<string>("");

  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const formValidation = useCallback(() => {
    if (workspaceName === owner.name) {
      return false;
    }
    let valid = true;

    if (workspaceName.length === 0) {
      setWorkspaceNameError("");
      valid = false;
      // eslint-disable-next-line no-useless-escape
    } else if (!workspaceName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setWorkspaceNameError(
        "Workspace name must only contain letters, numbers, and the characters `._-`"
      );
      valid = false;
    } else {
      setWorkspaceNameError("");
    }
    return valid;
  }, [owner.name, workspaceName]);

  useEffect(() => {
    setDisabled(!formValidation());
  }, [workspaceName, formValidation]);

  const handleUpdateWorkspace = async () => {
    setUpdating(true);
    const res = await fetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: workspaceName,
      }),
    });
    if (!res.ok) {
      window.alert("Failed to update workspace.");
      setUpdating(false);
    } else {
      setIsSheetOpen(false);
      // We perform a full refresh so that the Workspace name updates, and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  };

  const handleCancel = () => {
    setWorkspaceName(owner.name);
    setWorkspaceNameError("");
    setIsSheetOpen(false);
  };

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "workspace" })}
    >
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header title="Workspace Settings" icon={GlobeAltIcon} />
        <Page.Vertical align="stretch" gap="md">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Page.H variant="h4">Workspace Name</Page.H>
              <Page.P variant="secondary">{owner.name}</Page.P>
            </div>
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  label="Edit"
                  icon={PencilSquareIcon}
                />
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Edit Workspace Name</SheetTitle>
                </SheetHeader>
                <SheetContainer>
                  <div className="mt-6 flex flex-col gap-4">
                    <Page.P>
                      Think GitHub repository names, short and memorable.
                    </Page.P>
                    <Input
                      name="name"
                      placeholder="Workspace name"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      message={workspaceNameError}
                      messageStatus="error"
                    />
                  </div>
                </SheetContainer>
                <SheetFooter>
                  <Button
                    variant="tertiary"
                    label="Cancel"
                    onClick={handleCancel}
                  />
                  <Button
                    variant="primary"
                    label={updating ? "Saving..." : "Save"}
                    disabled={disable || updating}
                    onClick={handleUpdateWorkspace}
                  />
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </Page.Vertical>
        <Page.Vertical align="stretch" gap="md">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Page.H variant="h4">Model Selection</Page.H>
              <Page.P variant="secondary">
                Select the models you want available to your workspace.
              </Page.P>
            </div>
            <ProviderManagementModal owner={owner} plan={subscription.plan} />
          </div>
        </Page.Vertical>
        <Page.Vertical align="stretch" gap="md">
          <Page.H variant="h4">Capabilities</Page.H>
          <ContextItem.List>
            <div className="h-full border-b border-border dark:border-border-night" />
            <InteractiveContentSharingToggle owner={owner} />
            <VoiceTranscriptionToggle owner={owner} />
          </ContextItem.List>
        </Page.Vertical>
        {!isSlackDataSourceBotEnabled && (
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h4">Integrations</Page.H>

            <ContextItem.List>
              <div className="h-full border-b border-border dark:border-border-night" />
              <BotToggle
                owner={owner}
                botDataSource={slackBotDataSource}
                systemSpace={systemSpace}
                oauthProvider="slack"
                connectorProvider="slack_bot"
                name="Slack Bot"
                description="Use Dust Agents in Slack with the Dust Slack app"
                visual={<SlackLogo className="h-6 w-6" />}
              />
              <BotToggle
                owner={owner}
                botDataSource={microsoftBotDataSource}
                systemSpace={systemSpace}
                oauthProvider="microsoft"
                connectorProvider="microsoft_bot"
                name="Microsoft Teams Bot"
                description="Use Dust Agents in Teams with the Dust Microsoft Teams Bot"
                visual={<MicrosoftLogo className="h-6 w-6" />}
              />
            </ContextItem.List>
          </Page.Vertical>
        )}
      </Page.Vertical>
    </AppCenteredLayout>
  );
}

function BotToggle({
  owner,
  botDataSource,
  systemSpace,
  oauthProvider,
  connectorProvider,
  name,
  description,
  visual,
}: {
  owner: WorkspaceType;
  botDataSource: DataSourceType | null;
  systemSpace: SpaceType;
  oauthProvider: "slack" | "microsoft";
  connectorProvider: "slack_bot" | "microsoft_bot";
  name: string;
  description: string;
  visual: React.ReactNode;
}) {
  const { configValue } = useConnectorConfig({
    configKey: "botEnabled",
    dataSource: botDataSource ?? null,
    owner,
  });
  const isBotEnabled = configValue === "true";

  const toggleBotOnExistingDataSource = useToggleChatBot({
    dataSource: botDataSource ?? null,
    owner,
  });

  const [isChangingSlackBot, setIsChangingSlackBot] = useState(false);
  const sendNotification = useSendNotification();

  const createBotConnectionAndDataSource = async () => {
    try {
      // OAuth flow
      const cRes = await setupConnection({
        owner,
        provider: oauthProvider,
        useCase: "bot",
        extraConfig: {},
      });
      if (!cRes.isOk()) {
        throw cRes.error;
      }

      const res = await fetch(
        `/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: connectorProvider,
            connectionId: cRes.value,
            name: undefined,
            configuration: null,
          } satisfies PostDataSourceRequestBody),
        }
      );

      if (res.ok) {
        return await res.json();
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  };

  const toggleBot = async () => {
    setIsChangingSlackBot(true);
    if (botDataSource) {
      await toggleBotOnExistingDataSource(!isBotEnabled);
    } else {
      const createRes = await createBotConnectionAndDataSource();
      if (createRes) {
        // No need to toggle since default config already enabled the bot.
        // await toggleSlackBotOnExistingDataSource(true);
        // TODO: likely better to still make the call (but tricky since data source is not yet created).
        window.location.reload();
      } else {
        sendNotification({
          type: "error",
          title: `Failed to enable ${name}.`,
          description: `Could not create a new ${name} data source.`,
        });
      }
    }
    setIsChangingSlackBot(false);
  };

  return (
    <ContextItem
      title={name}
      subElement={description}
      visual={visual}
      hasSeparatorIfLast={true}
      action={
        <div className="flex flex-row items-center gap-2">
          {isBotEnabled && botDataSource && (
            <Button
              variant="outline"
              label="Reconnect"
              size="xs"
              icon={ArrowPathIcon}
              onClick={async () => {
                const cRes = await setupConnection({
                  owner,
                  provider: oauthProvider,
                  useCase: "bot",
                  extraConfig: {},
                });
                if (!cRes.isOk()) {
                  sendNotification({
                    type: "error",
                    title: `Failed to reconnect ${name}.`,
                    description: `Could not reconnect the Dust ${name}.`,
                  });
                } else {
                  const updateRes = await updateConnectorConnectionId(
                    cRes.value,
                    connectorProvider,
                    botDataSource,
                    owner
                  );

                  if (updateRes.error) {
                    sendNotification({
                      type: "error",
                      title: `Failed to update the ${name} connection`,
                      description: updateRes.error,
                    });
                  } else {
                    sendNotification({
                      type: "success",
                      title: `Successfully updated ${name} connection`,
                      description: "The connection was successfully updated.",
                    });
                  }
                }
              }}
            />
          )}
          <SliderToggle
            selected={
              // When changing and initially enabled, show disabled, and vice versa.
              isBotEnabled !== isChangingSlackBot
            }
            disabled={isChangingSlackBot}
            onClick={() => {
              void toggleBot();
            }}
          />
        </div>
      }
    />
  );
}

function InteractiveContentSharingToggle({ owner }: { owner: WorkspaceType }) {
  const { isEnabled, isChanging, doToggleInteractiveContentSharing } =
    useFrameSharingToggle({ owner });

  return (
    <ContextItem
      title="Public Frame sharing"
      subElement="Allow Frames to be shared publicly via links"
      visual={<DocumentTextIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleInteractiveContentSharing}
        />
      }
    />
  );
}

function VoiceTranscriptionToggle({ owner }: { owner: WorkspaceType }) {
  const { isEnabled, isChanging, doToggleVoiceTranscription } =
    useVoiceTranscriptionToggle({ owner });

  return (
    <ContextItem
      title="Voice transcription"
      subElement="Allow voice transcription in Dust conversations"
      visual={<MicIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleVoiceTranscription}
        />
      }
    />
  );
}

WorkspaceAdmin.getLayout = (page: ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
