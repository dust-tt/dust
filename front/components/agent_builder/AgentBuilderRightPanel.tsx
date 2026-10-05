import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { AgentBuilderPreview } from "@app/components/agent_builder/AgentBuilderPreview";
import { AgentBuilderSidekick } from "@app/components/agent_builder/AgentBuilderSidekick";
import { EmptyPlaceholder } from "@app/components/agent_builder/observability/shared/EmptyPlaceholder";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import { AgentInsightsTab } from "@app/components/assistant/details/tabs/AgentInsightsTab";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import {
  BarChart01,
  Beaker02,
  Button,
  LayoutRight,
  ScrollArea,
  Sidekick,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";

type AgentBuilderRightPanelTabType = "sidekick" | "preview" | "insights";

interface PanelHeaderProps {
  isSidekickDisabled: boolean;
  isPreviewPanelOpen: boolean;
  selectedTab: AgentBuilderRightPanelTabType;
  onTogglePanel: () => void;
  onTabChange: (tab: AgentBuilderRightPanelTabType) => void;
}

function PanelHeader({
  isSidekickDisabled,
  isPreviewPanelOpen,
  selectedTab,
  onTogglePanel,
  onTabChange,
}: PanelHeaderProps) {
  return (
    <div className="flex h-14 items-end">
      {isPreviewPanelOpen ? (
        <div className="flex w-full items-center">
          <ScrollArea aria-orientation="horizontal" className="flex-1">
            <Tabs value={selectedTab} className="w-full">
              <TabsList>
                <Button
                  icon={LayoutRight}
                  size="sm"
                  variant="ghost-secondary"
                  tooltip="Hide preview"
                  onClick={onTogglePanel}
                />
                {!isSidekickDisabled && (
                  <TabsTrigger
                    value="sidekick"
                    label="Sidekick"
                    icon={Sidekick}
                    onClick={() => onTabChange("sidekick")}
                  />
                )}
                <TabsTrigger
                  value="preview"
                  label="Preview"
                  icon={Beaker02}
                  onClick={() => onTabChange("preview")}
                />
                <TabsTrigger
                  value="insights"
                  label="Insights"
                  icon={BarChart01}
                  onClick={withTracking(
                    TRACKING_AREAS.BUILDER,
                    "insights_tab",
                    () => onTabChange("insights")
                  )}
                />
              </TabsList>
            </Tabs>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full w-full items-end justify-center pb-3.5">
          <Button
            icon={LayoutRight}
            size="sm"
            variant="ghost-secondary"
            tooltip="Open preview"
            onClick={onTogglePanel}
          />
        </div>
      )}
    </div>
  );
}

interface CollapsedTabsProps {
  isSidekickDisabled: boolean;
  onTabSelect: (tab: AgentBuilderRightPanelTabType) => void;
}

function CollapsedTabs({
  isSidekickDisabled,
  onTabSelect,
}: CollapsedTabsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      {!isSidekickDisabled && (
        <Button
          icon={Sidekick}
          variant="ghost"
          size="sm"
          tooltip="Sidekick"
          onClick={() => onTabSelect("sidekick")}
        />
      )}
      <Button
        icon={Beaker02}
        variant="ghost"
        size="sm"
        tooltip="Preview"
        onClick={() => onTabSelect("preview")}
      />
      <Button
        icon={BarChart01}
        variant="ghost"
        size="sm"
        tooltip="Insights"
        onClick={withTracking(TRACKING_AREAS.BUILDER, "insights_tab", () =>
          onTabSelect("insights")
        )}
      />
    </div>
  );
}

interface ExpandedContentProps {
  selectedTab: AgentBuilderRightPanelTabType;
  isSidekickDisabled: boolean;
  agentConfiguration?: AgentConfigurationType;
}

function ExpandedContent({
  selectedTab,
  isSidekickDisabled,
  agentConfiguration,
}: ExpandedContentProps) {
  const { owner } = useAgentBuilderContext();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedTab === "sidekick" && !isSidekickDisabled && (
        <div className="min-h-0 flex-1">
          <AgentBuilderSidekick />
        </div>
      )}
      {selectedTab === "preview" && (
        <div className="min-h-0 flex-1">
          <AgentBuilderPreview />
        </div>
      )}
      {selectedTab === "insights" &&
        (agentConfiguration ? (
          <section className="flex h-full flex-col overflow-y-auto p-4">
            <AgentInsightsTab
              owner={owner}
              agentConfiguration={agentConfiguration}
            />
          </section>
        ) : (
          <TabContentLayout title="Insights">
            <EmptyPlaceholder
              icon={BarChart01}
              title="Waiting for data"
              description="Use your agent or share it with your team to see insights data."
            />
          </TabContentLayout>
        ))}
    </div>
  );
}

interface AgentBuilderRightPanelProps {
  agentConfiguration?: AgentConfigurationType;
  isSidekickDisabled?: boolean;
}

export function AgentBuilderRightPanel({
  agentConfiguration,
  isSidekickDisabled = false,
}: AgentBuilderRightPanelProps) {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    usePreviewPanelContext();

  const [selectedTab, setSelectedTab] =
    useState<AgentBuilderRightPanelTabType>("sidekick");
  const activeTab =
    isSidekickDisabled && selectedTab === "sidekick" ? "preview" : selectedTab;

  const handleTogglePanel = () => {
    setIsPreviewPanelOpen((prev) => !prev);
  };

  const handleTabChange = (tab: AgentBuilderRightPanelTabType) => {
    if (isSidekickDisabled && tab === "sidekick") {
      return;
    }

    setSelectedTab(tab);
  };

  const handleTabSelect = (tab: AgentBuilderRightPanelTabType) => {
    if (isSidekickDisabled && tab === "sidekick") {
      return;
    }

    setSelectedTab(tab);
    setIsPreviewPanelOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mx-4">
        <PanelHeader
          isSidekickDisabled={isSidekickDisabled}
          isPreviewPanelOpen={isPreviewPanelOpen}
          selectedTab={activeTab}
          onTogglePanel={handleTogglePanel}
          onTabChange={handleTabChange}
        />
      </div>
      {isPreviewPanelOpen ? (
        <ExpandedContent
          selectedTab={activeTab}
          isSidekickDisabled={isSidekickDisabled}
          agentConfiguration={agentConfiguration}
        />
      ) : (
        <CollapsedTabs
          isSidekickDisabled={isSidekickDisabled}
          onTabSelect={handleTabSelect}
        />
      )}
    </div>
  );
}
