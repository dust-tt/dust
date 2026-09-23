import { DiscoverCatalog } from "@app/components/assistant/conversation/discover/DiscoverCatalog";
import type { PendingSkill } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { forwardRef, useState } from "react";

const DISCOVER_TABS = ["Discover", "Agents & Skills"] as const;
type DiscoverTab = (typeof DISCOVER_TABS)[number];

const FEATURED_SLOT_COUNT = 3;

const DISCOVER_SECTIONS = [
  "Agent & Skill for you",
  "Trending in the workspace",
] as const;

interface DiscoverContainerProps {
  onAgentConfigurationClick: (agent: LightAgentConfigurationType) => void;
  onSkillClick: (skill: PendingSkill) => void;
  onFiltersChange: () => void;
  owner: WorkspaceType;
}

export const DiscoverContainer = forwardRef<
  HTMLDivElement,
  DiscoverContainerProps
>(function DiscoverContainer(
  { onAgentConfigurationClick, onSkillClick, onFiltersChange, owner },
  ref
) {
  const [tab, setTab] = useState<DiscoverTab>("Discover");
  const [search, setSearch] = useState("");

  return (
    <div
      ref={ref}
      className="flex min-h-panel w-full shrink-0 flex-col items-center pb-16 pt-10"
    >
      <Tabs value={tab} className="flex w-full max-w-4xl flex-col gap-12">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="heading-2xl text-foreground">Discover</h1>
            {tab === "Agents & Skills" && (
              <div className="w-full sm:w-80">
                <SearchInput
                  name="discover-search"
                  placeholder="Search for agents or skills"
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    onFiltersChange();
                  }}
                />
              </div>
            )}
          </div>
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
        </div>
        <TabsContent value="Discover" className="flex flex-col gap-12">
          <section className="flex flex-col gap-3">
            <h2 className="heading-lg text-foreground">Featured</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {Array.from({ length: FEATURED_SLOT_COUNT }, (_, slot) => (
                <div
                  key={slot}
                  aria-hidden
                  className="h-56 rounded-2xl border border-dashed border-border-dark bg-muted-background"
                />
              ))}
            </div>
          </section>
          {DISCOVER_SECTIONS.map((title) => (
            <section key={title} className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="heading-lg text-foreground">{title}</h2>
                <Button
                  variant="ghost"
                  size="xs"
                  label="Find more"
                  onClick={() => setTab("Agents & Skills")}
                />
              </div>
            </section>
          ))}
        </TabsContent>
        <TabsContent value="Agents & Skills">
          <DiscoverCatalog
            owner={owner}
            search={search}
            onClearSearch={() => setSearch("")}
            onAgentClick={onAgentConfigurationClick}
            onSkillClick={onSkillClick}
            onFiltersChange={onFiltersChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
});
