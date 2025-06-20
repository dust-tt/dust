import {
  Avatar,
  Button,
  CompanyIcon,
  PlanetIcon,
  Dialog,
  Input,
  Page,
  PencilSquareIcon,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useCallback, useEffect, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import AppContentLayout from "@app/components/sparkle/AppContentLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { ProviderManagementModal } from "@app/components/workspace/ProviderManagementModal";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
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
  const [showEditWorkspaceNameModal, setShowEditWorkspaceNameModal] =
    useState(false);

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
      // We perform a full refresh so that the Workspace name updates and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  };

  return (
    <>
      <Dialog
        isOpen={showEditWorkspaceNameModal}
        onClose={() => {
          setShowEditWorkspaceNameModal(false);
          setWorkspaceName(owner.name);
          setWorkspaceNameError("");
        }}
        title="Edit Workspace Name"
        onValidate={async () => {
          await handleUpdateWorkspace();
          setShowEditWorkspaceNameModal(false);
        }}
        validateLabel="Save"
        isValidating={updating}
        disabled={disable}
      >
        <div className="flex flex-col gap-4">
          <Page.P>Think GitHub repository names, short and memorable.</Page.P>
          <Input
            name="name"
            placeholder="Workspace name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            message={workspaceNameError}
            messageStatus="error"
          />
        </div>
      </Dialog>
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
              <Button
                variant="secondary"
                label="Edit"
                icon={PencilSquareIcon}
                onClick={() => setShowEditWorkspaceNameModal(true)}
              />
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
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-4">
                <Avatar
                  size="md"
                  visual="https://dust.tt/static/systemavatar/slack_avatar_full.png"
                />
                <div>
                  <Page.H variant="h6">Slack Bot</Page.H>
                  <Page.P variant="secondary">
                    Use Dust Agents in Slack with the Dust Slack app
                  </Page.P>
                </div>
              </div>
              <SliderToggle
                selected={slackBotEnabled}
                onClick={() => {
                  setSlackBotEnabled(!slackBotEnabled);
                }}
              />
            </div>
          </Page.Vertical>
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h4">Subscriptions</Page.H>
            <div className="space-y-6">
              <div>
                <Page.H variant="h6">Your plan</Page.H>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-900">
                    {subscription.plan.name}
                  </span>
                  <Button
                    variant="tertiary"
                    label="•••"
                    size="xs"
                    onClick={() => {}}
                  />
                </div>
              </div>
              <div>
                <Page.H variant="h6">Payment, invoicing & billing</Page.H>
                <Page.P variant="secondary">
                  Estimated monthly billing: $
                  {subscription.plan.limits.users.maxUsers
                    ? subscription.plan.limits.users.maxUsers * 29
                    : 0}{" "}
                  ({subscription.plan.limits.users.maxUsers || 0} members, $29
                  per member)
                </Page.P>
                <Button
                  variant="secondary"
                  label="Dust's dashboard on Stripe"
                  icon={CompanyIcon}
                  className="mt-3"
                  onClick={() =>
                    window.open(`/w/${owner.sId}/subscription/manage`, "_blank")
                  }
                />
              </div>
            </div>
          </Page.Vertical>
        </Page.Vertical>
      </AppContentLayout>
    </>
  );
}

WorkspaceAdmin.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
