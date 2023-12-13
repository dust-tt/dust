import {
  Avatar,
  Button,
  Chip,
  MoreIcon,
  Page,
  PlusIcon,
  Searchbar,
  Tab,
} from "@dust-tt/sparkle";
import {
  AgentConfigurationType,
  AgentsGetViewType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationConversations } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

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
  owner,
  agentConfiguration,
  onShowDetails,
  onUpdate,
}: {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
  onShowDetails: () => void;
  onUpdate: () => void;
}) {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);

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
          {agentConfiguration.userListStatus === "in-list" && (
            <Chip color="emerald" size="xs" label="Added" />
          )}
          <Button.List isWrapping={true}>
            {agentConfiguration.userListStatus !== "in-list" && (
              <>
                <Button
                  variant="tertiary"
                  icon={PlusIcon}
                  disabled={isAdding}
                  size="xs"
                  label={"Add"}
                  onClick={async () => {
                    setIsAdding(true);

                    const body: PostAgentListStatusRequestBody = {
                      agentId: agentConfiguration.sId,
                      listStatus: "in-list",
                    };

                    const res = await fetch(
                      `/api/w/${owner.sId}/members/me/agent_list_status`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify(body),
                      }
                    );
                    if (!res.ok) {
                      const data = await res.json();
                      sendNotification({
                        title: `Error adding Assistant`,
                        description: data.error.message,
                        type: "error",
                      });
                    } else {
                      sendNotification({
                        title: `Assistant added`,
                        type: "success",
                      });
                      onUpdate();
                    }

                    setIsAdding(false);
                  }}
                />
                {/*
                <Button
                  variant="tertiary"
                  icon={PlayIcon}
                  size="xs"
                  label={"Test"}
                  onClick={() => {
                    // TODO: test
                  }}
                />
                */}
              </>
            )}
            <Button
              variant="tertiary"
              icon={MoreIcon}
              size="xs"
              label={"Show Assistant"}
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
      topNavigationCurrent="admin"
      subNavigation={subNavigationConversations({
        owner,
        current: "personal_assistants",
      })}
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
                owner={owner}
                agentConfiguration={a}
                onShowDetails={() => {
                  setShowDetails(a);
                }}
                onUpdate={() => {
                  void mutateAgentConfigurations();
                }}
              />
            ))}
          </div>
        </div>
      </Page.Vertical>
    </AppLayout>
  );
}
