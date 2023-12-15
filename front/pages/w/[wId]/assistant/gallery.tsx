import { Page, Searchbar, Tab } from "@dust-tt/sparkle";
import {
  AgentConfigurationType,
  AgentsGetViewType,
  assertNever,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { AssistantPreview } from "@app/components/assistant/AssistantPreview";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationConversations } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

const GALLERY_FLOWS = [
  "workspace_add",
  "conversation_add",
  "personal_add",
] as const;
export type GalleryFlow = (typeof GALLERY_FLOWS)[number];

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  agentsGetView: AgentsGetViewType;
  flow: GalleryFlow;
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

  let flow: GalleryFlow = "conversation_add";
  if (
    context.query.flow &&
    GALLERY_FLOWS.includes(context.query.flow as GalleryFlow)
  ) {
    flow = context.query.flow as GalleryFlow;
  }

  return {
    props: {
      user,
      owner,
      subscription,
      agentsGetView,
      flow,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AssistantsGallery({
  user,
  owner,
  subscription,
  agentsGetView,
  flow,
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
      href: `/w/${owner.sId}/assistant/gallery?view=all&flow=` + flow,
      current: agentsGetView === "all",
    },
    {
      label: "From Workspace",
      href: `/w/${owner.sId}/assistant/gallery?view=workspace&flow=` + flow,
      current: agentsGetView === "workspace",
    },
    {
      label: "From Teammates",
      href: `/w/${owner.sId}/assistant/gallery?view=published&flow=` + flow,
      current: agentsGetView === "published",
    },
    {
      label: "From Dust",
      href: `/w/${owner.sId}/assistant/gallery?view=global&flow=` + flow,
      current: agentsGetView === "global",
    },
  ];

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      hideSidebar
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="conversations"
      subNavigation={subNavigationConversations({
        owner,
        current: "personal_assistants",
      })}
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="Assistant Gallery"
          onClose={async () => {
            switch (flow) {
              case "conversation_add":
                await router.push(`/w/${owner.sId}/assistant/new`);
                break;
              case "personal_add":
                await router.push(`/w/${owner.sId}/assistant/assistants`);
                break;
              case "workspace_add":
                await router.push(`/w/${owner.sId}/builder/assistants`);
                break;
              default:
                assertNever(flow);
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
          flow={flow === "workspace_add" ? "workspace" : "personal"}
        />
      )}
      <div className="pb-16">
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
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              {filtered.map((a) => (
                <AssistantPreview
                  key={a.sId}
                  owner={owner}
                  agentConfiguration={a}
                  onShowDetails={() => {
                    setShowDetails(a);
                  }}
                  onUpdate={() => {
                    void mutateAgentConfigurations();
                  }}
                  variant="gallery"
                  flow={flow === "workspace_add" ? "workspace" : "personal"}
                />
              ))}
            </div>
          </div>
        </Page.Vertical>
      </div>
    </AppLayout>
  );
}
