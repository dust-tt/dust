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
  SliderToggle,
  SlackLogo,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ProviderManagementModal } from "@app/components/workspace/ProviderManagementModal";
import { getPriceAsString } from "@app/lib/client/subscription";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useWorkspaceActiveUsers } from "@app/lib/swr/workspaces";
import type { SubscriptionType, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isAdmin() || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      subscription,
    },
  };
});

export default function WorkspaceAdmin({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [disable, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState<string>("");

  const [slackBotEnabled, setSlackBotEnabled] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const { activeUsers } = useWorkspaceActiveUsers({ workspaceId: owner.sId });
  const workspaceSeats = activeUsers ? activeUsers.length : 0;

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

  const handleGoToStripePortal = async () => {
    window.open(`/w/${owner.sId}/subscription/manage`, "_blank");
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
            <ContextItem.List>
              <ContextItem
                title="Slack Bot"
                subElement="Use Dust Agents in Slack with the Dust Slack app"
                visual={<SlackLogo className="h-6 w-6" />}
                action={
                  <SliderToggle
                    selected={slackBotEnabled}
                    onClick={() => {
                      setSlackBotEnabled(!slackBotEnabled);
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
