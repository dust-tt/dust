import { AgentBuilderInsights } from "@app/components/agent_builder/AgentBuilderInsights";
import { AgentBuilderPreview } from "@app/components/agent_builder/AgentBuilderPreview";
import { AgentBuilderSidekick } from "@app/components/agent_builder/AgentBuilderSidekick";
import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { EmptyPlaceholder } from "@app/components/agent_builder/observability/shared/EmptyPlaceholder";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import {
  BarChartIcon,
  Button,
  ScrollArea,
  SidebarRightCloseIcon,
  SidebarRightOpenIcon,
  SidekickIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

type AgentBuilderRightPanelTabType = "sidekick" | "preview" | "insights";

interface PanelHeaderProps {
  isPreviewPanelOpen: boolean;
  selectedTab: AgentBuilderRightPanelTabType;
  onTogglePanel: () => void;
  onTabChange: (tab: AgentBuilderRightPanelTabType) => void;
}

function PanelHeader({
  isPreviewPanelOpen,
  selectedTab,
  onTogglePanel,
  onTabChange,
}: PanelHeaderProps) {
  return (
    <div className="flex h-16 items-end">
      {isPreviewPanelOpen ? (
        <div className="flex w-full items-center">
          <ScrollArea aria-orientation="horizontal" className="flex-1">
            <Tabs value={selectedTab} className="w-full">
              <TabsList>
                <Button
                  icon={SidebarRightCloseIcon}
                  size="sm"
                  variant="ghost-secondary"
                  tooltip="Hide preview"
                  onClick={onTogglePanel}
                />
                <TabsTrigger
                  value="sidekick"
                  label="Sidekick"
                  icon={SidekickIcon}
                  onClick={() => onTabChange("sidekick")}
                />
                <TabsTrigger
                  value="preview"
                  label="Preview"
                  icon={TestTubeIcon}
                  onClick={() => onTabChange("preview")}
                />
                <TabsTrigger
                  value="insights"
                  label="Insights"
                  icon={BarChartIcon}
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
            icon={SidebarRightOpenIcon}
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
  onTabSelect: (tab: AgentBuilderRightPanelTabType) => void;
}

function CollapsedTabs({ onTabSelect }: CollapsedTabsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <Button
        icon={SidekickIcon}
        variant="ghost"
        size="sm"
        tooltip="Sidekick"
        onClick={() => onTabSelect("sidekick")}
      />
      <Button
        icon={TestTubeIcon}
        variant="ghost"
        size="sm"
        tooltip="Preview"
        onClick={() => onTabSelect("preview")}
      />
      <Button
        icon={BarChartIcon}
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
  agentConfigurationId?: string;
}

function ExpandedContent({
  selectedTab,
  agentConfigurationId,
}: ExpandedContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedTab === "sidekick" && (
        <div className="min-h-0 flex-1">
          <AgentBuilderSidekick />
        </div>
      )}
      {selectedTab === "preview" && (
        <div className="min-h-0 flex-1">
          <AgentBuilderPreview />
        </div>
      )}
      <ObservabilityProvider>
        {selectedTab === "insights" &&
          (agentConfigurationId ? (
            <AgentBuilderInsights agentConfigurationId={agentConfigurationId} />
          ) : (
            <TabContentLayout title="Insights">
              <EmptyPlaceholder
                icon={BarChartIcon}
                title="Waiting for data"
                description="Use your agent or share it with your team to see insights data."
              />
            </TabContentLayout>
          ))}
      </ObservabilityProvider>
    </div>
  );
}

interface AgentBuilderRightPanelProps {
  agentConfigurationId?: string;
}

export function AgentBuilderRightPanel({
  agentConfigurationId,
}: AgentBuilderRightPanelProps) {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    usePreviewPanelContext();

  const [selectedTab, setSelectedTab] =
    useState<AgentBuilderRightPanelTabType>("sidekick");

  const handleTogglePanel = () => {
    setIsPreviewPanelOpen((prev) => !prev);
  };

  const handleTabChange = (tab: AgentBuilderRightPanelTabType) => {
    setSelectedTab(tab);
  };

  const handleTabSelect = (tab: AgentBuilderRightPanelTabType) => {
    setSelectedTab(tab);
    setIsPreviewPanelOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mx-4">
        <PanelHeader
          isPreviewPanelOpen={isPreviewPanelOpen}
          selectedTab={selectedTab}
          onTogglePanel={handleTogglePanel}
          onTabChange={handleTabChange}
        />
      </div>
      {isPreviewPanelOpen ? (
        <ExpandedContent
          selectedTab={selectedTab}
          agentConfigurationId={agentConfigurationId}
        />
      ) : (
        <CollapsedTabs onTabSelect={handleTabSelect} />
      )}
    </div>
  );
}
