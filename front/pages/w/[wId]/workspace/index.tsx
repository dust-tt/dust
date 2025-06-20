import {
  Button,
  CardIcon,
  Chip,
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
  useSendNotification,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ProviderManagementModal } from "@app/components/workspace/ProviderManagementModal";
import { getPriceAsString } from "@app/lib/client/subscription";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useMembersCount } from "@app/lib/swr/memberships";
import type {
  DataSourceType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { setupConnection } from "@app/components/spaces/AddConnectionMenu";
import { PostDataSourceRequestBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";
import {
  useConnectorConfig,
  useToggleSlackChatBot,
} from "@app/lib/swr/connectors";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
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

  const slackBotDataSource =
    (await DataSourceResource.listByConnectorProvider(auth, "slack_bot"))[0] ??
    null;

  const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);

  return {
    props: {
      owner,
      subscription,
      slackBotDataSource: slackBotDataSource?.toJSON() ?? null,
      systemSpace: systemSpace.toJSON(),
    },
  };
});

export default function WorkspaceAdmin({
  owner,
  subscription,
  slackBotDataSource,
  systemSpace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);
  const sendNotification = useSendNotification();

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState<string>("");
  const [isChangingSlackBot, setIsChangingSlackBot] = useState(false);

  const toggleSlackBotOnExistingDataSource = useToggleSlackChatBot({
    dataSource: slackBotDataSource ?? null,
    owner,
  });

  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const workspaceSeats = useMembersCount(owner);

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

  const { configValue } = useConnectorConfig({
    configKey: "botEnabled",
    dataSource: slackBotDataSource ?? null,
    owner,
  });

  const isSlackBotEnabled = configValue === "true";

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

  const handleGoToStripePortal = async () => {
    window.open(`/w/${owner.sId}/subscription/manage`, "_blank");
  };

  const createSlackBotConnectionAndDataSource = async () => {
    try {
      const connectionIdRes = await setupConnection({
        owner,
        provider: "slack_bot",
        extraConfig: {},
      });
      if (connectionIdRes.isErr()) {
        throw connectionIdRes.error;
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
            connectionId: connectionIdRes.value,
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
      const dataSource = await createSlackBotConnectionAndDataSource();
      if (dataSource) {
        await toggleSlackBotOnExistingDataSource(true);
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
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h4">Integrations</Page.H>
            <div className="h-full border-b border-border dark:border-border-night" />
            <ContextItem.List>
              <ContextItem
                title="Slack Bot"
                subElement="Use Dust Agents in Slack with the Dust Slack app"
                visual={<SlackLogo className="h-6 w-6" />}
                hasSeparatorIfLast={true}
                action={
                  <SliderToggle
                    selected={
                      // When changing and initially enabled, show disabled, and vice versa.
                      isSlackBotEnabled !== isChangingSlackBot
                    }
                    disabled={isChangingSlackBot}
                    onClick={() => {
                      toggleSlackBot();
                      setIsChangingSlackBot(false);
                    }}
                  />
                }
              />
            </ContextItem.List>
          </Page.Vertical>
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h4">Subscriptions</Page.H>
            <Page.Vertical align="stretch" gap="sm">
              <Page.H variant="h5">Your plan</Page.H>
              <div>
                <Page.Horizontal gap="sm">
                  <Chip size="sm" color="blue" label={subscription.plan.name} />
                  {subscription.stripeSubscriptionId && (
                    <Button
                      label="Manage my subscription"
                      onClick={handleGoToStripePortal}
                      variant="outline"
                    />
                  )}
                </Page.Horizontal>
              </div>
              {subscription.stripeSubscriptionId && (
                <>
                  <div className="h-4" />
                  <Page.Vertical gap="sm">
                    <Page.H variant="h5">Billing</Page.H>
                    <Page.P>
                      Estimated monthly billing:{" "}
                      <span className="font-bold">
                        {getPriceAsString({
                          currency: "usd",
                          priceInCents: 2900 * workspaceSeats,
                        })}
                      </span>{" "}
                      (excluding taxes).
                    </Page.P>
                    <Page.P>
                      {workspaceSeats === 1 ? (
                        <>
                          {workspaceSeats} member,{" "}
                          {getPriceAsString({
                            currency: "usd",
                            priceInCents: 2900,
                          })}{" "}
                          per member.
                        </>
                      ) : (
                        <>
                          {workspaceSeats} members,{" "}
                          {getPriceAsString({
                            currency: "usd",
                            priceInCents: 2900,
                          })}{" "}
                          per member.
                        </>
                      )}
                    </Page.P>
                    <div className="my-5">
                      <Button
                        icon={CardIcon}
                        label="Your billing dashboard on Stripe"
                        variant="outline"
                        onClick={handleGoToStripePortal}
                      />
                    </div>
                  </Page.Vertical>
                </>
              )}
            </Page.Vertical>
          </Page.Vertical>
        </Page.Vertical>
      </AppContentLayout>
    </>
  );
}

WorkspaceAdmin.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
