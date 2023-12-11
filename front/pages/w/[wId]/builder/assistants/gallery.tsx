import {
  Avatar,
  Button,
  Chip,
  MoreIcon,
  Page,
  PlayIcon,
  PlusIcon,
  Searchbar,
  Tab,
} from "@dust-tt/sparkle";
import {
  AgentConfigurationType,
  AgentsGetViewType,
  isAgentConfigurationInList,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  agentsGetView: AgentsGetViewType;
  returnTo: "conversation_new" | "assistants";
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);

  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !user || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const agentsGetView = (context.query.view || "all") as AgentsGetViewType;
  const returnTo: "conversation_new" | "assistants" =
    (context.query.returnTo as "conversation_new" | "assistants") ||
    `conversation_new`;

  return {
    props: {
      user,
      owner,
      subscription,
      agentsGetView,
      returnTo,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

const GalleryItem = function ({
  agentConfiguration,
  onShowDetails,
}: {
  agentConfiguration: AgentConfigurationType;
  onShowDetails: () => void;
}) {
  return (
    <div className="flex flex-row gap-2">
      <Avatar
        visual={<img src={agentConfiguration.pictureUrl} alt="Agent Avatar" />}
        size="md"
      />
      <div className="flex flex-col gap-2">
        <div className="text-md font-medium text-element-900">
          @{agentConfiguration.name}
        </div>
        <div className="flex flex-row gap-2">
          {isAgentConfigurationInList(agentConfiguration) && (
            <Chip color="emerald" size="xs" label="Added" />
          )}
          <Button.List>
            {!isAgentConfigurationInList(agentConfiguration) && (
              <>
                <Button
                  variant="tertiary"
                  icon={PlusIcon}
                  size="xs"
                  label={"Add"}
                  onClick={() => {
                    // setShowAllAgents(!showAllAgents);
                  }}
                />
                <Button
                  variant="tertiary"
                  icon={PlayIcon}
                  size="xs"
                  label={"Test"}
                  onClick={() => {
                    // setShowAllAgents(!showAllAgents);
                  }}
                />
              </>
            )}
            <Button
              variant="tertiary"
              icon={MoreIcon}
              size="xs"
              label={"Test"}
              labelVisible={false}
              onClick={() => {
                onShowDetails();
              }}
            />
          </Button.List>
        </div>
        <div className="text-sm text-element-800">
          {agentConfiguration.description}
        </div>
      </div>
    </div>
  );
};

export default function AssistantsGallery({
  user,
  owner,
  subscription,
  agentsGetView,
  returnTo,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const { agentConfigurations, mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView,
    });
  const [assistantSearch, setAssistantSearch] = useState<string>("");

  const filtered = agentConfigurations.filter((a) => {
    return (
      subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase()) &&
      a.status === "active"
    );
  });

  const [showDetails, setShowDetails] = useState<AgentConfigurationType | null>(
    null
  );

  const tabs = [
    {
      label: "All",
      href:
        `/w/${owner.sId}/builder/assistants/gallery?view=all&returnTo=` +
        returnTo,
      current: agentsGetView === "all",
    },
    {
      label: "From Workspace",
      href:
        `/w/${owner.sId}/builder/assistants/gallery?view=workspace&returnTo=` +
        returnTo,
      current: agentsGetView === "workspace",
    },
    // {
    //   label: "From Team Mates",
    //   href:
    //     `/w/${owner.sId}/builder/assistants/gallery?view=published&returnTo=` +
    //     returnTo,
    //   current: agentsGetView === "published",
    // },
    {
      label: "From Dust",
      href:
        `/w/${owner.sId}/builder/assistants/gallery?view=dust&returnTo=` +
        returnTo,
      current: agentsGetView === "dust",
    },
  ];

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      hideSidebar
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "assistants" })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="Assistant Gallery"
          onClose={async () => {
            switch (returnTo) {
              case "conversation_new":
                await router.push(`/w/${owner.sId}/assistant/new`);
                break;
              case "assistants":
                await router.push(`/w/${owner.sId}/builder/assistants`);
                break;
            }
          }}
        />
      }
    >
      {showDetails && (
        <AssistantDetails
          owner={owner}
          assistant={showDetails}
          show={showDetails !== null}
          onClose={() => {
            setShowDetails(null);
          }}
          onUpdate={() => {
            void mutateAgentConfigurations();
          }}
        />
      )}
      <Page.Vertical gap="xl" align="stretch">
        <Tab tabs={tabs} />
        <Searchbar
          name="search"
          placeholder="Search Assistants"
          value={assistantSearch}
          onChange={(s) => {
            setAssistantSearch(s);
          }}
        />
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-2">
            {filtered.map((a) => (
              <GalleryItem
                key={a.sId}
                agentConfiguration={a}
                onShowDetails={() => {
                  setShowDetails(a);
                }}
              />
            ))}
          </div>
        </div>
      </Page.Vertical>
    </AppLayout>
  );
}
