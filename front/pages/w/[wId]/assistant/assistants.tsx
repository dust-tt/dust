import {
  Avatar,
  BookOpenIcon,
  Button,
  ContextItem,
  Icon,
  MoreIcon,
  Page,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  Searchbar,
  SliderToggle,
  Tab,
  Tooltip,
  TrashIcon,
  UserGroupIcon,
  UserIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { SubscriptionType } from "@dust-tt/types";
import type {
  AgentUserListStatus,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useContext, useState } from "react";

import {
  DeleteAssistantDialog,
  RemoveAssistantFromListDialog,
} from "@app/components/assistant/AssistantActions";
import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { Authenticator, getSession } from "@app/lib/auth";
import { updateAgentUserListStatus } from "@app/lib/client/dust_api";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

const { GA_TRACKING_ID = "" } = process.env;

const PERSONAL_ASSISTANTS_VIEWS = ["personal", "workspace"] as const;
export type PersonalAssitsantsView = (typeof PERSONAL_ASSISTANTS_VIEWS)[number];

export const getServerSideProps = withGetServerSidePropsLogging<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  view: PersonalAssitsantsView;
  gaTrackingId: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);

  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const view = PERSONAL_ASSISTANTS_VIEWS.includes(
    context.query.view as PersonalAssitsantsView
  )
    ? (context.query.view as PersonalAssitsantsView)
    : "personal";

  return {
    props: {
      owner,
      subscription,
      view,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function PersonalAssistants({
  owner,
  subscription,
  view,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { agentConfigurations, mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: view === "personal" ? "list" : "workspace",
      includes: view === "personal" ? ["authors"] : [],
    });

  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);

  const viewAssistants = agentConfigurations.filter((a) => {
    if (view === "personal") {
      return a.scope === "private" || a.scope === "published";
    }
    if (view === "workspace") {
      return a.scope === "workspace" || a.scope === "global";
    }
  });

  const filtered = viewAssistants.filter((a) => {
    return subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase());
  });

  const [showRemovalModal, setShowRemovalModal] =
    useState<LightAgentConfigurationType | null>(null);
  const [showDeletionModal, setShowDeletionModal] =
    useState<LightAgentConfigurationType | null>(null);

  const tabs = [
    {
      label: "Personal & Shared Assistants",
      href: `/w/${owner.sId}/assistant/assistants?view=personal`,
      current: view === "personal",
    },
    {
      label: "Company Assistants",
      href: `/w/${owner.sId}/assistant/assistants?view=workspace`,
      current: view === "workspace",
    },
  ];

  const sendNotification = useContext(SendNotificationsContext);

  const updateAgentUserList = async (
    agentConfiguration: LightAgentConfigurationType,
    listStatus: AgentUserListStatus
  ) => {
    const { errorMessage, success } = await updateAgentUserListStatus({
      listStatus,
      owner,
      agentConfigurationId: agentConfiguration.sId,
    });

    if (success) {
      sendNotification({
        title: `Assistant ${
          listStatus === "in-list" ? "added to" : "removed from"
        } your list`,
        type: "success",
      });
      await mutateAgentConfigurations();
    } else {
      sendNotification({
        title: `Error ${
          listStatus === "in-list" ? "adding" : "removing"
        } Assistant`,
        description: errorMessage,
        type: "error",
      });
    }
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="conversations"
      navChildren={
        <AssistantSidebarMenu owner={owner} triggerInputAnimation={null} />
      }
    >
      {showDetails && (
        <AssistantDetails
          owner={owner}
          assistantId={showDetails.sId}
          show={showDetails !== null}
          onClose={({ shouldMutateAgentConfigurations }) => {
            setShowDetails(null);
            shouldMutateAgentConfigurations && void mutateAgentConfigurations();
          }}
        />
      )}

      {showRemovalModal && (
        <RemoveAssistantFromListDialog
          owner={owner}
          agentConfiguration={showRemovalModal}
          show={!!showRemovalModal}
          onClose={() => setShowRemovalModal(null)}
          onRemove={() => {
            void mutateAgentConfigurations();
          }}
        />
      )}
      {showDeletionModal && (
        <DeleteAssistantDialog
          owner={owner}
          agentConfigurationId={showDeletionModal.sId}
          show={!!showDeletionModal}
          onClose={() => setShowDeletionModal(null)}
          onDelete={() => {
            void mutateAgentConfigurations();
          }}
          isPrivateAssistant={true}
        />
      )}

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Manage Assistants"
          icon={RobotIcon}
          description="Manage your list of assistants, create and discover new ones."
        />
        <Page.Vertical gap="lg" align="stretch">
          <Tab tabs={tabs} />
          <Page.Vertical gap="md" align="stretch">
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
                {view !== "workspace" && (
                  <Link
                    href={`/w/${owner.sId}/assistant/gallery?flow=personal_add`}
                  >
                    <Button
                      variant="primary"
                      icon={BookOpenIcon}
                      label="Add from gallery"
                    />
                  </Link>
                )}
                {view !== "workspace" && viewAssistants.length > 0 && (
                  <Tooltip label="Create your own assistant">
                    <Link
                      href={`/w/${owner.sId}/builder/assistants/new?flow=personal_assistants`}
                    >
                      <Button variant="primary" icon={PlusIcon} label="New" />
                    </Link>
                  </Tooltip>
                )}
              </Button.List>
            </div>

            {view === "workspace" || viewAssistants.length > 0 ? (
              <ContextItem.List className="text-element-900">
                {filtered.map((agent) => (
                  <ContextItem
                    key={agent.sId}
                    title={`@${agent.name}`}
                    subElement={
                      agent.lastAuthors && agent.lastAuthors.length > 0 ? (
                        <>
                          <Icon
                            visual={
                              agent.lastAuthors.length > 1
                                ? UserGroupIcon
                                : UserIcon
                            }
                            size="xs"
                          />
                          {agent.lastAuthors.join(", ")}
                        </>
                      ) : (
                        <></>
                      )
                    }
                    visual={
                      <Avatar
                        visual={<img src={agent.pictureUrl} />}
                        size={"sm"}
                      />
                    }
                    action={
                      agent.scope !== "global" && (
                        <>
                          {agent.scope !== "workspace" ? (
                            <Button.List>
                              <Button
                                key="show_details"
                                icon={MoreIcon}
                                label={"View Assistant"}
                                labelVisible={false}
                                size="xs"
                                variant="tertiary"
                                onClick={() => setShowDetails(agent)}
                              />

                              <Link
                                href={`/w/${owner.sId}/builder/assistants/${agent.sId}?flow=personal_assistants`}
                              >
                                <Button
                                  variant="tertiary"
                                  icon={PencilSquareIcon}
                                  label="Edit"
                                  size="xs"
                                />
                              </Link>
                              <Button
                                variant="tertiary"
                                icon={
                                  agent.scope === "private"
                                    ? TrashIcon
                                    : XMarkIcon
                                }
                                label={
                                  agent.scope === "private"
                                    ? "Delete"
                                    : "Remove from my list"
                                }
                                labelVisible={false}
                                onClick={() => {
                                  agent.scope === "private"
                                    ? setShowDeletionModal(agent)
                                    : setShowRemovalModal(agent);
                                }}
                                size="xs"
                              />
                            </Button.List>
                          ) : (
                            <Button.List>
                              <Button
                                key="show_details"
                                icon={MoreIcon}
                                label={"View Assistant"}
                                labelVisible={false}
                                size="xs"
                                variant="tertiary"
                                onClick={() => setShowDetails(agent)}
                              />

                              <SliderToggle
                                size="xs"
                                onClick={async () => {
                                  await updateAgentUserList(
                                    agent,
                                    agent.userListStatus === "in-list"
                                      ? "not-in-list"
                                      : "in-list"
                                  );
                                }}
                                selected={agent.userListStatus === "in-list"}
                              />
                            </Button.List>
                          )}
                        </>
                      )
                    }
                  >
                    <ContextItem.Description>
                      <div className="text-element-700">
                        {agent.description}
                      </div>
                    </ContextItem.Description>
                  </ContextItem>
                ))}
              </ContextItem.List>
            ) : (
              <div className="pt-2">
                <EmptyCallToAction
                  href={`/w/${owner.sId}/builder/assistants/new?flow=personal_assistants`}
                  label="Create an Assistant"
                />
              </div>
            )}
          </Page.Vertical>
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}
