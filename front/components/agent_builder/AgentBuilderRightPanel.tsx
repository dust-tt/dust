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
import React, { useContext, useState } from "react";

import { AgentBuilderContext } from "./AgentBuilderContext";

interface AgentBuilderRightPanelProps {
  children?: React.ReactNode;
}

export function AgentBuilderRightPanel({
  children,
}: AgentBuilderRightPanelProps) {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    useContext(AgentBuilderContext);
  const [selectedTab, setSelectedTab] = useState("testing");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-end">
        <div className="flex h-full items-center">
          <Button
            icon={
              isPreviewPanelOpen ? SidebarRightCloseIcon : SidebarRightOpenIcon
            }
            variant="ghost-secondary"
            tooltip={isPreviewPanelOpen ? "Hide preview" : "Open preview"}
            onClick={() => setIsPreviewPanelOpen(!isPreviewPanelOpen)}
          />
        </div>
        {isPreviewPanelOpen && (
          <Tabs value={selectedTab} className="w-full">
            <TabsList>
              <TabsTrigger
                value="testing"
                label="Testing"
                icon={TestTubeIcon}
                onClick={() => setSelectedTab("testing")}
              />
              <TabsTrigger
                value="performance"
                label="Performance"
                icon={BarChartIcon}
                onClick={() => setSelectedTab("performance")}
              />
            </TabsList>
          </Tabs>
        )}
      </div>
      {isPreviewPanelOpen && (
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {selectedTab === "testing" && (
              <div className="space-y-4">Testing</div>
            )}
            {selectedTab === "performance" && (
              <div className="space-y-4">Performance</div>
            )}
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
