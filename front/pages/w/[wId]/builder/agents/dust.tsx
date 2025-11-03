import {
  Avatar,
  ContextItem,
  DustLogoSquare,
  Page,
  PlusIcon,
  SliderToggle,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useCallback, useMemo } from "react";

import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useSendNotification } from "@app/hooks/useNotification";
import { isRestrictedFromAgentCreation } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import type {
  LightAgentConfigurationType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  globalSpace: SpaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isAdmin() || !subscription) {
    return {
      notFound: true,
    };
  }

  if (await isRestrictedFromAgentCreation(owner)) {
    return {
      notFound: true,
    };
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  return {
    props: {
      owner,
      subscription,
      globalSpace: globalSpace.toJSON(),
    },
  };
});

export default function EditDustAgent({
  owner,
  subscription,
  globalSpace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useSendNotification();

  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "global",
  });

  const { spaceDataSourceViews: unfilteredSpaceDataSourceViews } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId: globalSpace.sId,
      category: "managed",
    });

  // We do not support remote databases for the Dust agent at the moment.
  const spaceDataSourceViews = useMemo(
    () =>
      unfilteredSpaceDataSourceViews.filter(
        (ds) => !isRemoteDatabase(ds.dataSource)
      ),
    [unfilteredSpaceDataSourceViews]
  );

  const handleToggleAgentStatus = useCallback(
    async (agent: LightAgentConfigurationType) => {
      const res = await fetch(
        `/api/w/${owner.sId}/assistant/global_agents/${agent.sId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status:
              agent.status === "disabled_by_admin"
                ? "active"
                : "disabled_by_admin",
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        sendNotification({
          title: "Error",
          description: `Failed to toggle agent: ${data.error?.message ?? "unknown error"}`,
          type: "error",
        });
        return;
      }

      await mutateAgentConfigurations();
    },
    [mutateAgentConfigurations, owner.sId, sendNotification]
  );

  const dustAgentConfiguration = agentConfigurations?.find(
    (c) => c.name === "dust"
  );
  if (!dustAgentConfiguration) {
    return null;
  }

  return (
    <AppCenteredLayout
      subscription={subscription}
      hideSidebar
      owner={owner}
      title={
        <AppLayoutSimpleCloseTitle
          title="Manage Dust Agent"
          onClose={async () => {
            await router.push(`/w/${owner.sId}/builder/agents`);
          }}
        />
      }
    >
      <Page.Header
        title="Dust Agent"
        icon={DustLogoSquare}
        description="The Dust agent is a general purpose agent that has context on your company data."
      />
      <div className="flex flex-col space-y-8 pb-8 pt-8">
        <div className="flex w-full flex-col gap-4">
          <>
            <Page.SectionHeader
              title="Availability"
              description="Enable the Dust agent for this workspace."
            />

            <ContextItem
              title="Enable the Dust agent for this workspace."
              visual={
                <Avatar
                  visual="https://dust.tt/static/systemavatar/dust_avatar_full.png"
                  size="xs"
                />
              }
              action={
                <SliderToggle
                  selected={dustAgentConfiguration?.status === "active"}
                  onClick={async () => {
                    await handleToggleAgentStatus(dustAgentConfiguration);
                  }}
                  disabled={
                    dustAgentConfiguration?.status === "disabled_free_workspace"
                  }
                />
              }
            />
          </>
          {spaceDataSourceViews.length === 0 ? (
            <Page.SectionHeader
              title="This workspace doesn't currently have any data sources."
              description="Add Company Data connections or data sources for better results."
              action={{
                label: "Add data",
                variant: "primary",
                icon: PlusIcon,
                onClick: async () => {
                  await router.push(
                    `/w/${owner.sId}/spaces/${globalSpace.sId}`
                  );
                },
              }}
            />
          ) : null}
        </div>
      </div>
    </AppCenteredLayout>
  );
}

EditDustAgent.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
