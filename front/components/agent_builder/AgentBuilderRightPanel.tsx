import {
  BarChartIcon,
  Button,
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

import { AgentBuilderPerformance } from "@app/components/agent_builder/AgentBuilderPerformance";
import { AgentBuilderPreview } from "@app/components/agent_builder/AgentBuilderPreview";
import { AgentBuilderTemplate } from "@app/components/agent_builder/AgentBuilderTemplate";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { TemplateActionPreset } from "@app/types";

type AgentBuilderRightPanelTabType = "testing" | "performance" | "template";

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
                  className="ml-4"
                />
                <TabsTrigger
                  value="testing"
                  label="Testing"
                  icon={TestTubeIcon}
                  onClick={() => onTabChange("testing")}
                />
                <TabsTrigger
                  value="performance"
                  label="Performance"
                  icon={BarChartIcon}
                  onClick={() => onTabChange("performance")}
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
        <div className="flex h-full w-full items-end justify-center">
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
        tooltip="Performance"
        onClick={() => onTabSelect("performance")}
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
  assistantTemplate: FetchAssistantTemplateResponse | null;
  onAddPresetAction?: (presetAction: TemplateActionPreset) => void;
}

function ExpandedContent({
  selectedTab,
  agentConfigurationSId,
  assistantTemplate,
  onAddPresetAction,
}: ExpandedContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedTab === "template" && assistantTemplate && (
        <AgentBuilderTemplate
          assistantTemplate={assistantTemplate}
          onAddPresetAction={onAddPresetAction}
        />
      )}
      {selectedTab === "testing" && (
        <div className="min-h-0 flex-1">
          <AgentBuilderPreview />
        </div>
      )}
      {selectedTab === "performance" && (
        <div className="flex-1 overflow-y-auto p-4">
          <AgentBuilderPerformance
            agentConfigurationSId={agentConfigurationSId}
          />
        </div>
      )}
    </div>
  );
}

interface AgentBuilderRightPanelProps {
  agentConfigurationSId?: string;
  assistantTemplate: FetchAssistantTemplateResponse | null;
  onAddPresetAction?: (presetAction: any) => void;
}

export function AgentBuilderRightPanel({
  agentConfigurationSId,
  assistantTemplate,
  onAddPresetAction,
}: AgentBuilderRightPanelProps) {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    usePreviewPanelContext();

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
    <div className="mx-4 flex h-full flex-col">
      <PanelHeader
        isPreviewPanelOpen={isPreviewPanelOpen}
        selectedTab={selectedTab}
        onTogglePanel={handleTogglePanel}
        onTabChange={handleTabChange}
        hasTemplate={hasTemplate}
      />
      {isPreviewPanelOpen ? (
        <ExpandedContent
          selectedTab={selectedTab}
          agentConfigurationSId={agentConfigurationSId}
          assistantTemplate={assistantTemplate}
          onAddPresetAction={onAddPresetAction}
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
