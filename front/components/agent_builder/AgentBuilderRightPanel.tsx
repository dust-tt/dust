import {
  BarChartIcon,
  Button,
  ListCheckIcon,
  MagicIcon,
  ScrollArea,
  SidebarRightCloseIcon,
  SidebarRightOpenIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { AgentBuilderObservability } from "@app/components/agent_builder/AgentBuilderObservability";
import { AgentBuilderPerformance } from "@app/components/agent_builder/AgentBuilderPerformance";
import { AgentBuilderPreview } from "@app/components/agent_builder/AgentBuilderPreview";
import { AgentBuilderTemplate } from "@app/components/agent_builder/AgentBuilderTemplate";
import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { EmptyPlaceholder } from "@app/components/agent_builder/observability/shared/EmptyPlaceholder";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";

type AgentBuilderRightPanelTabType =
  | "testing"
  | "feedback"
  | "template"
  | "insights";

interface PanelHeaderProps {
  isPreviewPanelOpen: boolean;
  selectedTab: AgentBuilderRightPanelTabType;
  onTogglePanel: () => void;
  onTabChange: (tab: AgentBuilderRightPanelTabType) => void;
  hasTemplate: boolean;
}

function PanelHeader({
  isPreviewPanelOpen,
  selectedTab,
  onTogglePanel,
  onTabChange,
  hasTemplate,
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
                  value="testing"
                  label="Testing"
                  icon={TestTubeIcon}
                  onClick={() => onTabChange("testing")}
                />
                <TabsTrigger
                  value="insights"
                  label="Insights"
                  icon={BarChartIcon}
                  onClick={() => onTabChange("insights")}
                />
                <TabsTrigger
                  value="feedback"
                  label="Feedback"
                  icon={ListCheckIcon}
                  onClick={() => onTabChange("feedback")}
                />
                {hasTemplate && (
                  <TabsTrigger
                    value="template"
                    label="Template"
                    icon={MagicIcon}
                    onClick={() => onTabChange("template")}
                  />
                )}
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
  hasTemplate: boolean;
}

function CollapsedTabs({ onTabSelect, hasTemplate }: CollapsedTabsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <Button
        icon={TestTubeIcon}
        variant="ghost"
        size="sm"
        tooltip="Testing"
        onClick={() => onTabSelect("testing")}
      />
      <Button
        icon={BarChartIcon}
        variant="ghost"
        size="sm"
        tooltip="Insights"
        onClick={() => onTabSelect("insights")}
      />
      <Button
        icon={ListCheckIcon}
        variant="ghost"
        size="sm"
        tooltip="Feedback"
        onClick={() => onTabSelect("feedback")}
      />
      {hasTemplate && (
        <Button
          icon={MagicIcon}
          variant="ghost"
          size="sm"
          tooltip="Template"
          onClick={() => onTabSelect("template")}
        />
      )}
    </div>
  );
}

interface ExpandedContentProps {
  selectedTab: AgentBuilderRightPanelTabType;
  agentConfigurationSId?: string;
}

function ExpandedContent({
  selectedTab,
  agentConfigurationSId,
}: ExpandedContentProps) {
  const { assistantTemplate, setPresetActionToAdd } = useAgentBuilderContext();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedTab === "template" && assistantTemplate && (
        <AgentBuilderTemplate
          assistantTemplate={assistantTemplate}
          onAddPresetAction={setPresetActionToAdd}
        />
      )}
      {selectedTab === "testing" && (
        <div className="min-h-0 flex-1">
          <AgentBuilderPreview />
        </div>
      )}
      <ObservabilityProvider>
        {selectedTab === "insights" &&
          (agentConfigurationSId ? (
            <AgentBuilderObservability
              agentConfigurationSId={agentConfigurationSId ?? ""}
            />
          ) : (
            <TabContentLayout title="Insights">
              <EmptyPlaceholder
                icon={BarChartIcon}
                title="Waiting for data"
                description="Use your agent or share it with your team to see feedback data."
              />
            </TabContentLayout>
          ))}
        {selectedTab === "feedback" &&
          (agentConfigurationSId ? (
            <AgentBuilderPerformance
              agentConfigurationSId={agentConfigurationSId}
            />
          ) : (
            <TabContentLayout title="Feedback">
              <EmptyPlaceholder
                icon={ListCheckIcon}
                title="Waiting for feedback"
                description="When users give feedback on responses, you'll see it here."
              />
            </TabContentLayout>
          ))}
      </ObservabilityProvider>
    </div>
  );
}

interface AgentBuilderRightPanelProps {
  agentConfigurationSId?: string;
}

export function AgentBuilderRightPanel({
  agentConfigurationSId,
}: AgentBuilderRightPanelProps) {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    usePreviewPanelContext();
  const { assistantTemplate } = useAgentBuilderContext();

  const hasTemplate = !!assistantTemplate;

  const [selectedTab, setSelectedTab] = useState<AgentBuilderRightPanelTabType>(
    hasTemplate ? "template" : "testing"
  );

  const handleTogglePanel = () => {
    setIsPreviewPanelOpen(!isPreviewPanelOpen);
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
          hasTemplate={hasTemplate}
        />
      </div>
      {isPreviewPanelOpen ? (
        <ExpandedContent
          selectedTab={selectedTab}
          agentConfigurationSId={agentConfigurationSId}
        />
      ) : (
        <CollapsedTabs
          onTabSelect={handleTabSelect}
          hasTemplate={hasTemplate}
        />
      )}
    </div>
  );
}
