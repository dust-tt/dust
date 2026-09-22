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
import type { CSSProperties } from "react";
import { useState } from "react";

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
  style?: CSSProperties;
  user: UserType;
}

export function DiscoverContainer({
  onAgentConfigurationClick,
  owner,
  style,
  user,
}: DiscoverContainerProps) {
  const [tab, setTab] = useState<DiscoverTab>("Discover");

  return (
    <div
      id="discover-container"
      className="flex h-full w-full max-w-conversation flex-col gap-2 py-8"
      style={style}
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
}
