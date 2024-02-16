import {
  Button,
  DropdownMenu,
  DustIcon,
  Page,
  PlanetIcon,
  Searchbar,
  Tab,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type {
  AgentsGetViewType,
  LightAgentConfigurationType,
  PlanType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useState } from "react";

import { AssistantDetails } from "@app/components/assistant/AssistantDetails";
import { GalleryAssistantPreviewContainer } from "@app/components/assistant/GalleryAssistantPreviewContainer";
import { TryAssistantModal } from "@app/components/assistant/TryAssistantModal";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { Authenticator, getSession } from "@app/lib/auth";
import { useAgentConfigurations } from "@app/lib/swr";
import { subFilter } from "@app/lib/utils";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withGetServerSidePropsLogging<{
  user: UserType;
  owner: WorkspaceType;
  plan: PlanType | null;
  subscription: SubscriptionType;
  gaTrackingId: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();
  const plan = auth.plan();
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
      plan,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function AssistantsGallery({
  user,
  owner,
  plan,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [orderBy, setOrderBy] = useState<"name" | "usage">("name");

  const [agentsGetView, setAgentsGetView] = useState<AgentsGetViewType>("all");

  const { agentConfigurations, mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView,
      includes: orderBy === "usage" ? ["authors", "usage"] : ["authors"],
    });

  const [assistantSearch, setAssistantSearch] = useState<string>("");

  let agentsToDisplay: LightAgentConfigurationType[] = [];

  switch (orderBy) {
    case "name": {
      agentsToDisplay = agentConfigurations
        .filter((a) => {
          return (
            subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase()) &&
            a.status === "active"
          );
        })
        .sort((a, b) => {
          return a.name.localeCompare(b.name);
        });
      break;
    }
    case "usage": {
      agentsToDisplay = agentConfigurations.filter((a) => {
        return (
          subFilter(assistantSearch.toLowerCase(), a.name.toLowerCase()) &&
          a.status === "active"
        );
      });
      let allHaveUsage = true;
      agentsToDisplay.forEach((a) => {
        if (!a.usage) {
          allHaveUsage = false;
        }
      });
      if (allHaveUsage) {
        agentsToDisplay.sort((a, b) => {
          if (a.usage && b.usage) {
            return b.usage.messageCount - a.usage.messageCount;
          } else {
            // Need that to be type safe
            return a.name.localeCompare(b.name);
          }
        });
      }
      break;
    }
    default:
      assertNever(orderBy);
  }

  const [showDetails, setShowDetails] =
    useState<LightAgentConfigurationType | null>(null);
  const [testModalAssistant, setTestModalAssistant] =
    useState<LightAgentConfigurationType | null>(null);

  const tabs: {
    label: string;
    current: boolean;
    viewId: AgentsGetViewType;
    icon?: ComponentType<{ className?: string }>;
  }[] = [
    {
      label: "All",
      current: agentsGetView === "all",
      viewId: "all",
    },
    {
      label: "Shared",
      current: agentsGetView === "published",
      icon: UserGroupIcon,
      viewId: "published",
    },
    {
      label: "Company",
      current: agentsGetView === "workspace",
      icon: PlanetIcon,
      viewId: "workspace",
    },
    {
      label: "Default",
      current: agentsGetView === "global",
      icon: DustIcon,
      viewId: "global",
    },
  ];

  // Headless UI does not inherently handle Portal-based rendering,
  // leading to dropdown menus being hidden by parent divs with overflow settings.
  // Adapts layout for smaller screens.
  const SearchOrderDropdown = (
    <div className="shrink-0">
      <DropdownMenu>
        <DropdownMenu.Button>
          <Button
            type="select"
            labelVisible={true}
            label={`Order by: ${orderBy}`}
            variant="tertiary"
            hasMagnifying={false}
            size="sm"
          />
        </DropdownMenu.Button>
        <DropdownMenu.Items origin="topLeft">
          <DropdownMenu.Item
            key="name"
            label="Name"
            onClick={() => setOrderBy("name")}
          />
          <DropdownMenu.Item
            key="usage"
            label="Usage"
            onClick={() => {
              setOrderBy("usage");
            }}
          />
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
  );

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      hideSidebar
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="conversations"
      titleChildren={
        <AppLayoutSimpleCloseTitle
          title="Assistant Gallery"
          onClose={() => router.back()}
        />
      }
    >
      <AssistantDetails
        owner={owner}
        assistantId={showDetails?.sId || null}
        onClose={() => setShowDetails(null)}
        mutateAgentConfigurations={mutateAgentConfigurations}
      />
      {testModalAssistant && (
        <TryAssistantModal
          owner={owner}
          user={user}
          assistant={testModalAssistant}
          onClose={() => setTestModalAssistant(null)}
        />
      )}
      <div className="pb-16 pt-6">
        <Page.Vertical gap="md" align="stretch">
          <div className="flex flex-row gap-2">
            <Searchbar
              name="search"
              placeholder="Search (Name)"
              value={assistantSearch}
              onChange={(s) => {
                setAssistantSearch(s);
              }}
            />
            <div className="block md:hidden">{SearchOrderDropdown}</div>
          </div>
          <div className="flex flex-row space-x-4">
            <div className="grow overflow-x-auto scrollbar-hide">
              <Tab
                tabs={tabs}
                onTabClick={(tabName) => {
                  const newView = tabs.find((t) => t.label === tabName)?.viewId;
                  newView && setAgentsGetView(newView);
                }}
              />
            </div>
            <div className="hidden md:block">{SearchOrderDropdown}</div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {agentsToDisplay.map((a) => (
                <GalleryAssistantPreviewContainer
                  key={a.sId}
                  owner={owner}
                  plan={plan}
                  agentConfiguration={a}
                  onShowDetails={() => {
                    setShowDetails(a);
                  }}
                  onUpdate={() => {
                    void mutateAgentConfigurations();
                  }}
                  setTestModalAssistant={setTestModalAssistant}
                />
              ))}
            </div>
          </div>
        </Page.Vertical>
      </div>
    </AppLayout>
  );
}
