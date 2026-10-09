import type { CatalogItem } from "@app/components/assistant/conversation/discover/catalog";
import { DiscoverCatalog } from "@app/components/assistant/conversation/discover/DiscoverCatalog";
import { DiscoverHome } from "@app/components/assistant/conversation/discover/DiscoverHome";
import { DiscoverPinDialog } from "@app/components/assistant/conversation/discover/DiscoverPinDialog";
import type { PendingSkill } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { AgentDetailsSheet } from "@app/components/assistant/details/AgentDetailsSheet";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { useElementHeight } from "@app/hooks/useElementHeight";
import type { RichAgentMentionCandidate } from "@app/types/assistant/mentions";
import type { UserType, WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { CSSProperties } from "react";
import { forwardRef, useState } from "react";

const DISCOVER_TABS = ["Featured", "Catalog"] as const;
type DiscoverTab = (typeof DISCOVER_TABS)[number];

const DISCOVER_TAB_LABELS: Record<DiscoverTab, MessageDescriptor> = {
  Featured: msg({ message: "Featured", context: "discover tab" }),
  Catalog: msg({ message: "Catalog", context: "discover tab" }),
};

// Lets the Catalog stack its sticky search below the sticky header.
interface DiscoverContainerStyle extends CSSProperties {
  "--discover-header-height": string;
}

interface DiscoverContainerProps {
  onAgentConfigurationClick: (agent: RichAgentMentionCandidate) => void;
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
  const { t } = useLingui();
  const [tab, setTab] = useState<DiscoverTab>("Featured");
  const { height: headerHeight, ref: headerRef } = useElementHeight();
  const style: DiscoverContainerStyle = {
    "--discover-header-height": `${headerHeight}px`,
  };
  const [pinTarget, setPinTarget] = useState<CatalogItem | null>(null);
  const onPin = isAdmin(owner) ? setPinTarget : undefined;
  const [detailsTarget, setDetailsTarget] = useState<{
    item: CatalogItem;
    onClose?: () => void;
  } | null>(null);
  const showDetails = (item: CatalogItem, onClose?: () => void) => {
    setDetailsTarget({ item, onClose });
  };
  const closeDetails = () => {
    // Favorite changes made in the sheet must be reflected in the catalog.
    detailsTarget?.onClose?.();
    setDetailsTarget(null);
  };

  return (
    <div
      ref={ref}
      className="flex min-h-panel w-full shrink-0 flex-col items-center pb-16"
      style={style}
    >
      <Tabs value={tab} className="flex w-full max-w-4xl flex-col gap-8">
        <div
          ref={headerRef}
          className="sticky top-0 z-30 flex flex-col gap-6 bg-(--color-panel-background) pt-10"
        >
          <h1 className="heading-2xl text-foreground">
            <Trans context="page title">Discover</Trans>
          </h1>
          <TabsList>
            {DISCOVER_TABS.map((discoverTab) => (
              <TabsTrigger
                key={discoverTab}
                value={discoverTab}
                label={t(DISCOVER_TAB_LABELS[discoverTab])}
                onClick={() => setTab(discoverTab)}
              />
            ))}
          </TabsList>
        </div>
        <TabsContent value="Featured" className="flex flex-col gap-12">
          <DiscoverHome
            owner={owner}
            onAgentClick={onAgentConfigurationClick}
            onSkillClick={onSkillClick}
            onPin={onPin}
            onDetails={showDetails}
            onFindMore={() => setTab("Catalog")}
          />
        </TabsContent>
        <TabsContent value="Catalog">
          <DiscoverCatalog
            owner={owner}
            onAgentClick={onAgentConfigurationClick}
            onSkillClick={onSkillClick}
            onPin={onPin}
            onDetails={showDetails}
            onFiltersChange={onFiltersChange}
          />
        </TabsContent>
      </Tabs>
      <AgentDetailsSheet
        owner={owner}
        user={user}
        agentId={
          detailsTarget?.item.kind === "agent"
            ? detailsTarget.item.agent.sId
            : null
        }
        onClose={closeDetails}
      />
      <SkillDetailsSheet
        owner={owner}
        user={user}
        skillId={
          detailsTarget?.item.kind === "skill"
            ? detailsTarget.item.skill.sId
            : null
        }
        onClose={closeDetails}
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
