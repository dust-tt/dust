import {
  Avatar,
  BookOpenIcon,
  Button,
  ContextItem,
  PlusIcon,
  Searchbar,
  Tooltip,
} from "@dust-tt/sparkle";
import type { AgentConfigurationScope, SubscriptionType } from "@dust-tt/types";
import type {
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { SCOPE_INFO } from "@app/components/assistant/Sharing";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { Authenticator, getSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withGetServerSidePropsLogging<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
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

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function MyAssistants({
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const {
    agentConfigurations,
    mutateAgentConfigurations,
    isAgentConfigurationsLoading,
  } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    includes: ["authors"],
  });

  const [assistantSearch, setAssistantSearch] = useState<string>("");
  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);

  const searchFilteredAssistants = agentConfigurations.filter((a) => {
    return subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase());
  });

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="My Assistants"
          onClose={() => router.push(`/w/${owner.id}/assistant/new`)}
        />
      }
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
          onClose={() => setShowDetails(null)}
          mutateAgentConfigurations={mutateAgentConfigurations}
        />
      )}
      <div className="flex flex-col gap-4 pt-9">
        <Searchbar
          name="search"
          size="md"
          placeholder="Search (Name)"
          value={assistantSearch}
          onChange={(s) => {
            setAssistantSearch(s);
          }}
        />
        <Button.List>
          {searchFilteredAssistants.length > 0 && (
            <Tooltip label="Create your own assistant">
              <Link
                href={`/w/${owner.sId}/builder/assistants/new?flow=personal_assistants`}
              >
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Create An Assistant"
                  size="sm"
                />
              </Link>
            </Tooltip>
          )}
          <Link href={`/w/${owner.sId}/assistant/gallery?flow=personal_add`}>
            <Button
              variant="primary"
              icon={BookOpenIcon}
              label="Explore the Assistant Gallery"
              size="sm"
            />
          </Link>
        </Button.List>
        <ContextItem.List>
          {searchFilteredAssistants.length === 0 &&
            !isAgentConfigurationsLoading && (
              <ContextItem
                title="No assistant found matching the search."
                visual={undefined}
              />
            )}
          {["private", "published", "workspace", "global"].map((scope) => (
            <ScopeSection
              key={scope}
              assistantList={searchFilteredAssistants}
              scope={scope as AgentConfigurationScope}
              onAssistantClick={(agent) => () => setShowDetails(agent)}
            />
          ))}
        </ContextItem.List>
      </div>
    </AppLayout>
  );
}

function ScopeSection({
  assistantList,
  scope,
  onAssistantClick,
}: {
  assistantList: LightAgentConfigurationType[];
  scope: AgentConfigurationScope;
  onAssistantClick: (agent: LightAgentConfigurationType) => () => void;
}) {
  const filteredList = assistantList.filter((a) => a.scope === scope);
  if (filteredList.length === 0) {
    return null;
  }
  return (
    <>
      <ContextItem.SectionHeader
        title={SCOPE_INFO[scope].label + "s"}
        description={SCOPE_INFO[scope].text}
      />
      {filteredList.map((agent) => (
        <ContextItem
          key={agent.sId}
          title={`@${agent.name}`}
          subElement={`By: ${agent.lastAuthors?.map((a) => a).join(", ")}`}
          visual={<Avatar visual={<img src={agent.pictureUrl} />} size="md" />}
          onClick={onAssistantClick(agent)}
        >
          <ContextItem.Description>
            <div className="text-element-700">{agent.description}</div>
          </ContextItem.Description>
        </ContextItem>
      ))}
    </>
  );
}
