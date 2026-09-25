import type { CatalogItem } from "@app/components/assistant/conversation/discover/DiscoverCatalog";
import { DiscoverCatalog } from "@app/components/assistant/conversation/discover/DiscoverCatalog";
import { DiscoverHome } from "@app/components/assistant/conversation/discover/DiscoverHome";
import { DiscoverPinDialog } from "@app/components/assistant/conversation/discover/DiscoverPinDialog";
import type { PendingSkill } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { UserType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { forwardRef, useState } from "react";

const DISCOVER_TABS = ["Discover", "Agents & Skills"] as const;
type DiscoverTab = (typeof DISCOVER_TABS)[number];

interface DiscoverContainerProps {
  onAgentConfigurationClick: (agent: LightAgentConfigurationType) => void;
  onSkillClick: (skill: PendingSkill) => void;
  onFiltersChange: () => void;
  owner: WorkspaceType;
  user: UserType;
}

export const DiscoverContainer = forwardRef<
  HTMLDivElement,
  DiscoverContainerProps
>(function DiscoverContainer(
  { onAgentConfigurationClick, onSkillClick, onFiltersChange, owner, user },
  ref
) {
  const [tab, setTab] = useState<DiscoverTab>("Discover");
  const [pinTarget, setPinTarget] = useState<CatalogItem | null>(null);
  const onPin = isAdmin(owner) ? setPinTarget : undefined;
  const [detailsTarget, setDetailsTarget] = useState<CatalogItem | null>(null);

  return (
    <div
      ref={ref}
      className="flex min-h-panel w-full shrink-0 flex-col items-center pb-16"
    >
      <Tabs value={tab} className="flex w-full max-w-4xl flex-col gap-8">
        <div className="sticky top-0 z-30 flex flex-col gap-6 bg-background pt-10">
          <h1 className="heading-2xl text-foreground">Discover</h1>
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
          <DiscoverHome
            owner={owner}
            onAgentClick={onAgentConfigurationClick}
            onSkillClick={onSkillClick}
            onPin={onPin}
            onDetails={setDetailsTarget}
            onFindMore={() => setTab("Agents & Skills")}
          />
        </TabsContent>
        <TabsContent value="Agents & Skills">
          <DiscoverCatalog
            owner={owner}
            onAgentClick={onAgentConfigurationClick}
            onSkillClick={onSkillClick}
            onPin={onPin}
            onDetails={setDetailsTarget}
            onFiltersChange={onFiltersChange}
          />
        </TabsContent>
      </Tabs>
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={
          detailsTarget?.kind === "agent" ? detailsTarget.agent.sId : null
        }
        onClose={() => setDetailsTarget(null)}
      />
      <SkillDetailsSheet
        owner={owner}
        user={user}
        skillId={
          detailsTarget?.kind === "skill" ? detailsTarget.skill.sId : null
        }
        onClose={() => setDetailsTarget(null)}
      />
      {pinTarget && (
        <DiscoverPinDialog
          owner={owner}
          item={pinTarget}
          onClose={() => setPinTarget(null)}
        />
      )}
    </div>
  );
});
