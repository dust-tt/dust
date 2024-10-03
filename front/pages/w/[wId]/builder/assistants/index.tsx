import {
  Avatar,
  Button,
  Cog6ToothIcon,
  ContextItem,
  Page,
  PlusIcon,
  Popup,
  RobotIcon,
  Searchbar,
  SliderToggle,
  Tab,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  LightAgentConfigurationType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever, isBuilder } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import type { SearchOrderType } from "@app/components/assistant/SearchOrderDropdown";
import { SearchOrderDropdown } from "@app/components/assistant/SearchOrderDropdown";
import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { SCOPE_INFO } from "@app/components/assistant_builder/Sharing";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import AppLayout from "@app/components/sparkle/AppLayout";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { classNames, subFilter } from "@app/lib/utils";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  tabScope: AgentConfigurationScope;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !auth.isBuilder() || !subscription) {
    return {
      notFound: true,
    };
  }
  const tabScope = Object.keys(SCOPE_INFO).includes(
    context.query.tabScope as AgentConfigurationScope
  )
    ? (context.query.tabScope as AgentConfigurationScope)
    : "workspace";
  return {
    props: {
      owner,
      tabScope,
      subscription,
    },
  };
});

export default function WorkspaceAssistants({
  owner,
  tabScope,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [orderBy, setOrderBy] = useState<SearchOrderType>("name");
  const [showDisabledFreeWorkspacePopup, setShowDisabledFreeWorkspacePopup] =
    useState<string | null>(null);

  const includes: ("authors" | "usage")[] = (() => {
    switch (tabScope) {
      case "published":
        return ["authors", "usage"];
      case "private":
      case "global":
      case "workspace":
        return ["usage"];
      default:
        assertNever(tabScope);
    }
  })();

  // only fetch the agents that are relevant to the current scope, except when
  // user searches: search across all agents
  const {
    agentConfigurations,
    mutateRegardlessOfQueryParams: mutateAgentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: tabScope === "private" ? "list" : tabScope,
    includes,
  });

  const { agentConfigurations: searchableAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: assistantSearch ? "assistants-search" : null,
    });

  const filteredAgents = (
    assistantSearch ? searchableAgentConfigurations : agentConfigurations
  ).filter((a) => {
    return (
      // filter by tab only if no search
      (assistantSearch || a.scope === tabScope) &&
      subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase())
    );
  });

  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);

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

    await mutateAgentConfigurations();
  };
  const tabs = (
    ["workspace", "published", "private", "global"] as AgentConfigurationScope[]
  ).map((scope) => ({
    label: SCOPE_INFO[scope].shortLabel,
    current: scope === tabScope,
    icon: SCOPE_INFO[scope].icon,
    href: `/w/${owner.sId}/builder/assistants?tabScope=${scope}`,
  }));

  const disabledTablineClass =
    "!border-element-500 !text-element-500 !cursor-default";

  const searchBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        if (searchBarRef.current) {
          searchBarRef.current.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, []);

  switch (orderBy) {
    case "name": {
      filteredAgents.sort((a, b) => {
        return a.name.localeCompare(b.name);
      });
      break;
    }
    case "usage": {
      filteredAgents.sort((a, b) => {
        return (b.usage?.messageCount || 0) - (a.usage?.messageCount || 0);
      });
      break;
    }
    case "edited_at":
      filteredAgents.sort((a, b) => {
        const dateA = a.versionCreatedAt
          ? new Date(a.versionCreatedAt).getTime()
          : -Infinity;
        const dateB = b.versionCreatedAt
          ? new Date(b.versionCreatedAt).getTime()
          : -Infinity;
        return dateB - dateA;
      });
      break;
    default:
      assertNever(orderBy);
  }

  useEffect(() => {
    if (tabScope === "global") {
      setOrderBy("name");
    }
  }, [tabScope]);

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      navChildren={<AssistantSidebarMenu owner={owner} />}
    >
      <AssistantDetails
        owner={owner}
        assistantId={showDetails?.sId || null}
        onClose={() => setShowDetails(null)}
      />
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header title="Manage Assistants" icon={RobotIcon} />
        <Page.Vertical gap="md" align="stretch">
          <div className="flex flex-row gap-2">
            <Searchbar
              ref={searchBarRef}
              name="search"
              placeholder="Search (Name)"
              value={assistantSearch}
              onChange={(s) => {
                setAssistantSearch(s);
              }}
            />
            <Button.List>
              <Link
                href={`/w/${owner.sId}/builder/assistants/create?flow=workspace_assistants`}
              >
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Create an assistant"
                />
              </Link>
            </Button.List>
          </div>
          <div className="flex flex-col gap-4 pt-3">
            <div className="flex flex-row gap-2">
              <Tab
                tabs={tabs}
                tabClassName={classNames(
                  assistantSearch ? disabledTablineClass : ""
                )}
              />
              <div className="flex grow items-end justify-end">
                <SearchOrderDropdown
                  orderBy={orderBy}
                  setOrderBy={setOrderBy}
                  disabled={tabScope === "global"}
                />
              </div>
            </div>
            <Page.P>
              {assistantSearch
                ? "Searching across all assistants"
                : SCOPE_INFO[tabScope].text}
            </Page.P>
            {filteredAgents.length > 0 || isAgentConfigurationsLoading ? (
              <AgentViewForScope
                owner={owner}
                agents={filteredAgents}
                scopeView={assistantSearch ? "search-view" : tabScope}
                setShowDetails={setShowDetails}
                handleToggleAgentStatus={handleToggleAgentStatus}
                showDisabledFreeWorkspacePopup={showDisabledFreeWorkspacePopup}
                setShowDisabledFreeWorkspacePopup={
                  setShowDisabledFreeWorkspacePopup
                }
              />
            ) : (
              !assistantSearch && (
                <div className="pt-2">
                  <EmptyCallToAction
                    href={`/w/${owner.sId}/builder/assistants/create?flow=workspace_assistants`}
                    label="Create an Assistant"
                    icon={PlusIcon}
                  />
                </div>
              )
            )}
          </div>
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}

function AgentViewForScope({
  owner,
  agents,
  scopeView,
  setShowDetails,
  handleToggleAgentStatus,
  showDisabledFreeWorkspacePopup,
  setShowDisabledFreeWorkspacePopup,
}: {
  owner: WorkspaceType;
  agents: LightAgentConfigurationType[];
  scopeView: AgentConfigurationScope | "search-view";
  setShowDetails: (agent: LightAgentConfigurationType) => void;
  handleToggleAgentStatus: (
    agent: LightAgentConfigurationType
  ) => Promise<void>;
  showDisabledFreeWorkspacePopup: string | null;
  setShowDisabledFreeWorkspacePopup: (s: string | null) => void;
}) {
  const router = useRouter();

  return (
    <ContextItem.List>
      {agents.map((agent) => (
        <ContextItem
          key={agent.sId}
          title={`@${agent.name}`}
          subElement={
            agent.scope === "global" || scopeView === "search-view"
              ? null
              : assistantUsageMessage({
                  assistantName: agent.name,
                  usage: agent.usage || null,
                  isLoading: false,
                  isError: false,
                  shortVersion: true,
                })
          }
          visual={<Avatar visual={agent.pictureUrl} size="md" />}
          onClick={() => setShowDetails(agent)}
          action={
            agent.scope === "global" ? (
              <GlobalAgentAction agent={agent} />
            ) : null
          }
        >
          <ContextItem.Description>
            <div className="line-clamp-2 text-element-700">
              {agent.description}
            </div>
          </ContextItem.Description>
        </ContextItem>
      ))}
    </ContextItem.List>
  );

  function GlobalAgentAction({
    agent,
  }: {
    agent: LightAgentConfigurationType;
  }) {
    if (agent.sId === "helper") {
      return null;
    }

    if (agent.sId === "dust") {
      return (
        <Button
          variant="secondary"
          icon={Cog6ToothIcon}
          label="Manage"
          size="sm"
          disabled={!isBuilder(owner)}
          onClick={(e) => {
            e.stopPropagation();
            void router.push(`/w/${owner.sId}/builder/assistants/dust`);
          }}
        />
      );
    }

    return (
      <div className="relative">
        <SliderToggle
          size="xs"
          onClick={async (e) => {
            e.stopPropagation();
            await handleToggleAgentStatus(agent);
          }}
          selected={agent.status === "active"}
          disabled={agent.status === "disabled_missing_datasource"}
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
    );
  }
}
