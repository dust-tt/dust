import { AgentBrowserContainer } from "@app/components/assistant/conversation/AgentBrowserContainer";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType, WorkspaceType } from "@app/types/user";
import {
  Page,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { forwardRef, useState } from "react";

const DISCOVER_TABS = ["Discover", "Agents & Skills"] as const;
type DiscoverTab = (typeof DISCOVER_TABS)[number];

const DISCOVER_SECTIONS = [
  "Featured",
  "Agent & Skill for you",
  "Trending in the workspace",
] as const;

interface DiscoverContainerProps {
  onAgentConfigurationClick: (agent: LightAgentConfigurationType) => void;
  owner: WorkspaceType;
  user: UserType;
}

export const DiscoverContainer = forwardRef<
  HTMLDivElement,
  DiscoverContainerProps
>(function DiscoverContainer({ onAgentConfigurationClick, owner, user }, ref) {
  const [tab, setTab] = useState<DiscoverTab>("Discover");

  return (
    <div
      ref={ref}
      id="discover-container"
      className="flex min-h-panel w-full max-w-conversation shrink-0 flex-col gap-2 pb-16 pt-6"
    >
      <Tabs value={tab}>
        <TabsList>
          {DISCOVER_TABS.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              label={t}
              onClick={() => setTab(t)}
            />
          ))}
        </TabsList>
        <TabsContent value="Discover">
          <div className="flex flex-col gap-8 py-4">
            {DISCOVER_SECTIONS.map((title) => (
              <Page.SectionHeader key={title} title={title} />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="Agents & Skills">
          <AgentBrowserContainer
            onAgentConfigurationClick={onAgentConfigurationClick}
            owner={owner}
            user={user}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
});
