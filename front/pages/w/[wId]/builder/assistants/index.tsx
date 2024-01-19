import {
  Avatar,
  BookOpenIcon,
  Button,
  Cog6ToothIcon,
  ContextItem,
  DropdownMenu,
  Page,
  PencilSquareIcon,
  PlusIcon,
  Popup,
  RobotIcon,
  Searchbar,
  SliderToggle,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { SubscriptionType } from "@dust-tt/types";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import {
  DeleteAssistantDialog,
  RemoveAssistantFromWorkspaceDialog,
} from "@app/components/assistant/AssistantActions";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { compareAgentsForSort } from "@app/lib/assistant";
import { Authenticator, getSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  gaTrackingId: string;
}> = async (context) => {
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

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function WorkspaceAssistants({
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const {
    agentConfigurations: workspaceAgents,
    mutateAgentConfigurations: mutateWorkspaceAgents,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "workspace",
  });
  const {
    agentConfigurations: globalAgents,
    mutateAgentConfigurations: mutateGlobalAgents,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "global",
  });

  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);

  const filtered = workspaceAgents.filter((a) => {
    return subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase());
  });

  globalAgents.sort(compareAgentsForSort);

  const handleToggleAgentStatus = async (
    agent: LightAgentConfigurationType
  ) => {
    if (agent.status === "disabled_free_workspace") {
      setShowDisabledFreeWorkspacePopup(agent.sId);
      return;
    }
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
      window.alert(`Error toggling Assistant: ${data.error.message}`);
      return;
    }

    await mutateGlobalAgents();
  };

  const [showDeletionModal, setShowDeletionModal] =
    useState<LightAgentConfigurationType | null>(null);
  const [showRemoveFromWorkspaceModal, setShowRemoveFromWorkspaceModal] =
    useState<LightAgentConfigurationType | null>(null);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
        owner,
        current: "workspace_assistants",
      })}
    >
      {showDeletionModal && (
        <DeleteAssistantDialog
          owner={owner}
          show={showDeletionModal !== null}
          agentConfigurationId={showDeletionModal.sId}
          onClose={() => {
            setShowDeletionModal(null);
          }}
          onDelete={async () => {
            await mutateWorkspaceAgents();
          }}
        />
      )}
      {showRemoveFromWorkspaceModal && (
        <RemoveAssistantFromWorkspaceDialog
          owner={owner}
          show={showRemoveFromWorkspaceModal !== null}
          agentConfiguration={showRemoveFromWorkspaceModal}
          onClose={() => {
            setShowRemoveFromWorkspaceModal(null);
          }}
          onRemove={async () => {
            await mutateWorkspaceAgents();
          }}
        />
      )}

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Manage Workspace Assistants"
          icon={RobotIcon}
          description="Workspace assistants will be activated by default for every member of the workspace. Only Admins and Builders can activate, create, or edit workspace assistants."
        />
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
              <Link
                href={`/w/${owner.sId}/assistant/gallery?flow=workspace_add`}
              >
                <Button
                  variant="primary"
                  icon={BookOpenIcon}
                  label="Add from gallery"
                />
              </Link>
              {workspaceAgents.length > 0 && (
                <Link
                  href={`/w/${owner.sId}/builder/assistants/new?flow=workspace_assistants`}
                >
                  <Button variant="primary" icon={PlusIcon} label="New" />
                </Link>
              )}
            </Button.List>
          </div>

          {workspaceAgents.length > 0 ? (
            <ContextItem.List className="text-element-900">
              {filtered.map((agent) => (
                <ContextItem
                  key={agent.sId}
                  title={`@${agent.name}`}
                  visual={
                    <Avatar
                      visual={<img src={agent.pictureUrl} />}
                      size={"sm"}
                    />
                  }
                  action={
                    <Button.List>
                      <Link
                        href={`/w/${owner.sId}/builder/assistants/${agent.sId}?flow=workspace_assistants`}
                      >
                        <Button
                          variant="tertiary"
                          icon={PencilSquareIcon}
                          label="Edit"
                          size="xs"
                          disabled={!isBuilder(owner)}
                        />
                      </Link>
                      <DropdownMenu>
                        <DropdownMenu.Button>
                          <Button
                            variant="tertiary"
                            icon={XMarkIcon}
                            label="Remove from workspace"
                            labelVisible={false}
                            size="xs"
                          />
                        </DropdownMenu.Button>
                        <DropdownMenu.Items origin="topRight" width={350}>
                          <DropdownMenu.Item
                            label="Delete the assistant"
                            visual={null}
                            icon={TrashIcon}
                            onClick={() => {
                              setShowDeletionModal(agent);
                            }}
                          />
                          <DropdownMenu.Item
                            label="Remove from workspace list"
                            visual={null}
                            icon={XMarkIcon}
                            onClick={() => {
                              setShowRemoveFromWorkspaceModal(agent);
                            }}
                          />
                        </DropdownMenu.Items>
                      </DropdownMenu>
                    </Button.List>
                  }
                >
                  <ContextItem.Description>
                    <div className="text-element-700">{agent.description}</div>
                  </ContextItem.Description>
                </ContextItem>
              ))}
            </ContextItem.List>
          ) : (
            <div className="pt-2">
              <EmptyCallToAction
                href={`/w/${owner.sId}/builder/assistants/new?flow=workspace_assistants`}
                label="Create an Assistant"
              />
            </div>
          )}
        </Page.Vertical>

        <div className="flex flex-col gap-y-2">
          <Page.SectionHeader
            title="Dust Assistants"
            description='Assistants built by Dust for multiple use&nbsp;cases. For instance, use "@help" for any&nbsp;question Dust related, use&nbsp;the&nbsp;handle "@gpt4" to&nbsp;interact with GPT-4 directly…'
          />
          <ContextItem.List>
            {globalAgents.map((agent) => (
              <ContextItem
                key={agent.sId}
                title={`@${agent.name}`}
                visual={
                  <Avatar visual={<img src={agent.pictureUrl} />} size={"sm"} />
                }
                action={
                  ["helper"].includes(agent.sId) ? null : agent.sId ===
                    "dust" ? (
                    <Button
                      variant="secondary"
                      icon={Cog6ToothIcon}
                      label="Manage"
                      size="sm"
                      disabled={!isBuilder(owner)}
                      onClick={() => {
                        void router.push(
                          `/w/${owner.sId}/builder/assistants/dust`
                        );
                      }}
                    />
                  ) : (
                    <div className="relative">
                      <SliderToggle
                        size="xs"
                        onClick={async () => {
                          await handleToggleAgentStatus(agent);
                        }}
                        selected={agent.status === "active"}
                        disabled={
                          agent.status === "disabled_missing_datasource" ||
                          !isBuilder(owner)
                        }
                      />
                      <Popup
                        show={showDisabledFreeWorkspacePopup === agent.sId}
                        className="absolute bottom-8 right-0"
                        chipLabel={`Free plan`}
                        description={`@${agent.name} is only available on our paid plans.`}
                        buttonLabel="Check Dust plans"
                        buttonClick={() => {
                          void router.push(`/w/${owner.sId}/subscription`);
                        }}
                        onClose={() => {
                          setShowDisabledFreeWorkspacePopup(null);
                        }}
                      />
                    </div>
                  )
                }
              >
                <ContextItem.Description>
                  <div className="text-element-700">{agent.description}</div>
                </ContextItem.Description>
              </ContextItem>
            ))}
          </ContextItem.List>
        </div>
      </Page.Vertical>
    </AppLayout>
  );
}
