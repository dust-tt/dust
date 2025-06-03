import {
  BarChartIcon,
  Button,
  SidebarRightCloseIcon,
  SidebarRightOpenIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import { ScrollArea } from "@dust-tt/sparkle";
import React, { useContext, useState } from "react";

import { AgentBuilderContext } from "./AgentBuilderContext";

type AgentBuilderRightPanelTabType = "testing" | "performance";

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
          <div className="px-1">
            <Button
              icon={SidebarRightCloseIcon}
              size="sm"
              variant="ghost-secondary"
              tooltip="Hide preview"
              onClick={onTogglePanel}
            />
          </div>
          <ScrollArea aria-orientation="horizontal" className="flex-1">
            <Tabs value={selectedTab} className="w-full">
              <TabsList>
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
              </TabsList>
            </Tabs>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full w-full items-end justify-center px-1">
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
    </div>
  );
}

interface ExpandedContentProps {
  selectedTab: AgentBuilderRightPanelTabType;
}

function ExpandedContent({ selectedTab }: ExpandedContentProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 p-4">
        {selectedTab === "testing" && <div className="space-y-4">Testing</div>}
        {selectedTab === "performance" && (
          <div className="space-y-4">Performance</div>
        )}
      </div>
    </div>
  );
}

export function AgentBuilderRightPanel() {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    useContext(AgentBuilderContext);
  const [selectedTab, setSelectedTab] =
    useState<AgentBuilderRightPanelTabType>("testing");

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
      <PanelHeader
        isPreviewPanelOpen={isPreviewPanelOpen}
        selectedTab={selectedTab}
        onTogglePanel={handleTogglePanel}
        onTabChange={handleTabChange}
      />
      {isPreviewPanelOpen ? (
        <ExpandedContent selectedTab={selectedTab} />
      ) : (
        <CollapsedTabs onTabSelect={handleTabSelect} />
      )}
    </div>
  );
}
