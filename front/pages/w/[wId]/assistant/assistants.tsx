import {
  Avatar,
  BookOpenIcon,
  Button,
  ContextItem,
  Page,
  PlusIcon,
  RobotIcon,
  Searchbar,
  Tooltip,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { UserType, WorkspaceType } from "@dust-tt/types";
import { SubscriptionType } from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import { RemoveAssistantFromListDialog } from "@app/components/assistant/AssistantActions";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import {
  subNavigationAssistants,
  subNavigationConversations,
} from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
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

  return {
    props: {
      user,
      owner,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function PersonalAssistants({
  user,
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const { agentConfigurations, mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list",
    });

  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const filtered = agentConfigurations.filter((a) => {
    return subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase());
  });
  const [showRemovalModal, setShowRemovalModal] = useState<boolean>(false);

  // const isBuilder = owner.role === "builder" || owner.role === "admin";

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent={
        owner.role === "user" ? "conversations" : "assistants"
      }
      subNavigation={
        owner.role === "user"
          ? subNavigationConversations({
              owner,
              current: "personal_assistants",
            })
          : subNavigationAssistants({
              owner,
              current: "personal_assistants",
            })
      }
      navChildren={
        owner.role === "user" && (
          <AssistantSidebarMenu owner={owner} triggerInputAnimation={null} />
        )
      }
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Manage my assistants"
          icon={RobotIcon}
          description="Manage your list of assistants, create and discover new ones."
        />
        <div className="flex flex-row gap-2">
          <div className="flex w-full flex-1">
            <div className="w-full">
              <Searchbar
                name="search"
                placeholder="Assistant Name"
                value={assistantSearch}
                onChange={(s) => {
                  setAssistantSearch(s);
                }}
              />
            </div>
          </div>
          <Button.List>
            <Button
              variant="primary"
              icon={BookOpenIcon}
              label="Add from gallery"
              onClick={() => {
                void router.push(
                  `/w/${owner.sId}/assistant/gallery?flow=personal_add`
                );
              }}
            />
            <Tooltip label="Coming soon">
              <Button
                variant="primary"
                icon={PlusIcon}
                disabled={true}
                label="New"
              />
            </Tooltip>
          </Button.List>
        </div>
        <ContextItem.List className="text-element-900">
          {filtered.map((agent) => (
            <ContextItem
              key={agent.sId}
              title={`@${agent.name}`}
              visual={
                <Avatar visual={<img src={agent.pictureUrl} />} size={"sm"} />
              }
              action={
                agent.scope !== "global" && (
                  <>
                    <RemoveAssistantFromListDialog
                      owner={owner}
                      agentConfiguration={agent}
                      show={showRemovalModal}
                      onClose={() => setShowRemovalModal(false)}
                      onRemove={() => {
                        void mutateAgentConfigurations();
                      }}
                    />
                    <Button
                      variant="tertiary"
                      icon={XMarkIcon}
                      label="Remove from my list"
                      labelVisible={false}
                      onClick={() => {
                        setShowRemovalModal(true);
                      }}
                      size="xs"
                    />
                  </>
                )
              }
            >
              <ContextItem.Description>
                <div className="text-element-700">{agent.description}</div>
              </ContextItem.Description>
            </ContextItem>
          ))}
        </ContextItem.List>
      </Page.Vertical>
    </AppLayout>
  );
}
