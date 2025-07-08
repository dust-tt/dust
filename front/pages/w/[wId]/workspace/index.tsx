import {
  ArrowPathIcon,
  Button,
  ContextItem,
  Input,
  Page,
  PencilSquareIcon,
  PlanetIcon,
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
import { useCallback, useEffect, useState } from "react";

import { updateConnectorConnectionId } from "@app/components/data_source/ConnectorPermissionsModal";
import { subNavigationAdmin } from "@app/components/navigation/config";
import { setupConnection } from "@app/components/spaces/AddConnectionMenu";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ProviderManagementModal } from "@app/components/workspace/ProviderManagementModal";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  useConnectorConfig,
  useToggleSlackChatBot,
} from "@app/lib/swr/connectors";
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
  systemSpace: SpaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isAdmin() || !subscription) {
    return {
      notFound: true,
    };
  }

  const [[slackDataSource], [slackBotDataSource]] = await Promise.all([
    DataSourceResource.listByConnectorProvider(auth, "slack"),
    DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
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
      systemSpace: systemSpace.toJSON(),
    },
  };
});

export default function WorkspaceAdmin({
  owner,
  subscription,
  isSlackDataSourceBotEnabled,
  slackBotDataSource,
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
      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
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
    <>
      <AppContentLayout
        subscription={subscription}
        owner={owner}
        subNavigation={subNavigationAdmin({ owner, current: "workspace" })}
      >
        <Page.Vertical align="stretch" gap="xl">
          <Page.Header title="Workspace Settings" icon={PlanetIcon} />
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
              <ProviderManagementModal owner={owner} />
            </div>
          </Page.Vertical>
          {!isSlackDataSourceBotEnabled && (
            <Page.Vertical align="stretch" gap="md">
              <Page.H variant="h4">Integrations</Page.H>
              <SlackBotToggle
                owner={owner}
                slackBotDataSource={slackBotDataSource}
                systemSpace={systemSpace}
              />
            </Page.Vertical>
          )}
        </Page.Vertical>
      </AppContentLayout>
    </>
  );
}

function SlackBotToggle({
  owner,
  slackBotDataSource,
  systemSpace,
}: {
  owner: WorkspaceType;
  slackBotDataSource: DataSourceType | null;
  systemSpace: SpaceType;
}) {
  const { configValue } = useConnectorConfig({
    configKey: "botEnabled",
    dataSource: slackBotDataSource ?? null,
    owner,
  });
  const isSlackBotEnabled = configValue === "true";

  const toggleSlackBotOnExistingDataSource = useToggleSlackChatBot({
    dataSource: slackBotDataSource ?? null,
    owner,
  });

  const [isChangingSlackBot, setIsChangingSlackBot] = useState(false);
  const sendNotification = useSendNotification();

  const createSlackBotConnectionAndDataSource = async () => {
    try {
      // OAuth flow
      const cRes = await setupConnection({
        owner,
        provider: "slack",
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
            provider: "slack_bot",
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

  const toggleSlackBot = async () => {
    setIsChangingSlackBot(true);
    if (slackBotDataSource) {
      await toggleSlackBotOnExistingDataSource(!isSlackBotEnabled);
    } else {
      const createRes = await createSlackBotConnectionAndDataSource();
      if (createRes) {
        // No need to toggle since default config already enabled the bot.
        // await toggleSlackBotOnExistingDataSource(true);
        // TODO: likely better to still make the call (but tricky since data source is not yet created).
        window.location.reload();
      } else {
        sendNotification({
          type: "error",
          title: `Failed to enable Slack Bot.`,
          description: `Could not create a new Slack Bot data source.`,
        });
      }
    }
    setIsChangingSlackBot(false);
  };

  return (
    <ContextItem.List>
      <div className="h-full border-b border-border dark:border-border-night" />
      <ContextItem
        title="Slack Bot"
        subElement="Use Dust Agents in Slack with the Dust Slack app"
        visual={<SlackLogo className="h-6 w-6" />}
        hasSeparatorIfLast={true}
        action={
          <div className="flex flex-row items-center gap-2">
            {isSlackBotEnabled && slackBotDataSource && (
              <Button
                variant="outline"
                label="Reconnect"
                size="xs"
                icon={ArrowPathIcon}
                onClick={async () => {
                  const cRes = await setupConnection({
                    owner,
                    provider: "slack",
                    useCase: "bot",
                    extraConfig: {},
                  });
                  if (!cRes.isOk()) {
                    sendNotification({
                      type: "error",
                      title: "Failed to reconnect Slack Bot.",
                      description: "Could not reconnect the Dust Slack Bot.",
                    });
                  } else {
                    const updateRes = await updateConnectorConnectionId(
                      cRes.value,
                      "slack_bot",
                      slackBotDataSource,
                      owner
                    );

                    if (updateRes.error) {
                      sendNotification({
                        type: "error",
                        title: "Failed to update the Slack Bot connection",
                        description: updateRes.error,
                      });
                    } else {
                      sendNotification({
                        type: "success",
                        title: "Successfully updated Slack Bot connection",
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
                isSlackBotEnabled !== isChangingSlackBot
              }
              disabled={isChangingSlackBot}
              onClick={() => {
                void toggleSlackBot();
              }}
            />
          </div>
        }
      />
    </ContextItem.List>
  );
}

WorkspaceAdmin.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
