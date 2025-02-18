import {
  Button,
  CloudArrowLeftRightIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  GithubIcon,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  PlatformActionsProviderType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { setupOAuthConnection } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useMemo, useState } from "react";

import { ConversationsNavigationProvider } from "@app/components/assistant/conversation/ConversationsNavigationProvider";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  useCreatePlatformActionsConfigurations,
  useDeletePlatformActionsConfigurations,
  usePlatformActionsConfigurations,
} from "@app/lib/swr/platform_actions";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (_context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  const flags = await getFeatureFlags(owner);
  if (!flags.includes("labs_github_actions") || !auth.isAdmin()) {
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

export default function PlatformActionsConfiguration({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useSendNotification();

  const [providerToDelete, setProviderToDelete] =
    useState<null | PlatformActionsProviderType>(null);

  const { configurations, isConfigurationsLoading } =
    usePlatformActionsConfigurations({ owner });

  const doCreatePlatformActionsConfiguration =
    useCreatePlatformActionsConfigurations({ owner });

  const doDeletePlatformActionsConfiguration =
    useDeletePlatformActionsConfigurations({ owner });

  // Github

  const githubActionsConfiguration = useMemo(() => {
    return configurations.find((c) => c.provider === "github") || null;
  }, [configurations]);

  const handleConnectGithub = async () => {
    const cRes = await setupOAuthConnection({
      dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
      owner,
      provider: "github",
      useCase: "platform_actions",
      extraConfig: {},
    });

    if (cRes.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to connect Github",
        description: cRes.error.message,
      });
      return;
    }

    await doCreatePlatformActionsConfiguration({
      provider: "github",
      connectionId: cRes.value.connection_id,
    });
  };

  return (
    <ConversationsNavigationProvider>
      <AppLayout
        subscription={subscription}
        owner={owner}
        pageTitle="Dust - Platform Actions"
        navChildren={<AssistantSidebarMenu owner={owner} />}
      >
        <Dialog
          open={providerToDelete !== null}
          onOpenChange={(open) => {
            if (!open) {
              setProviderToDelete(null);
            }
          }}
        >
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Disconnect platform actions provider</DialogTitle>
            </DialogHeader>
            <DialogContainer>
              This will prevent agents from taking platform actions. You can
              reconnect at anytime.
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
                  if (providerToDelete !== null) {
                    await doDeletePlatformActionsConfiguration({
                      provider: providerToDelete,
                    });
                  }
                  setProviderToDelete(null);
                },
              }}
            />
          </DialogContent>
        </Dialog>

        <Page>
          <Page.Header
            title="Platform actions"
            icon={CloudArrowLeftRightIcon}
            description="Configure platform actions for your agents"
          />
          <Page.Layout direction="vertical">
            <Page.SectionHeader title="Github" />

            {!isConfigurationsLoading && (
              <>
                {githubActionsConfiguration ? (
                  <Page.Layout direction="horizontal">
                    <Button
                      label="Connected"
                      size="sm"
                      icon={GithubIcon}
                      disabled={true}
                    />
                    <Button
                      label="Disconnect"
                      icon={XMarkIcon}
                      size="sm"
                      variant="outline"
                      onClick={() => setProviderToDelete("github")}
                    />
                  </Page.Layout>
                ) : (
                  <>
                    <Page.P>
                      Connect to Github and select repositories where you want
                      Dust agents to take actions (create or modify issues,
                      access or review pull-requests).
                    </Page.P>
                    <div>
                      <Button
                        label="Connect"
                        size="sm"
                        icon={GithubIcon}
                        onClick={async () => {
                          await handleConnectGithub();
                        }}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </Page.Layout>
        </Page>
      </AppLayout>
    </ConversationsNavigationProvider>
  );
}
