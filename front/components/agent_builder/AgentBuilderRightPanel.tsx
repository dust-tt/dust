import {
  ArrowPathIcon,
  BarChartIcon,
  Button,
  MagicIcon,
  Markdown,
  Page,
  ScrollArea,
  SidebarRightCloseIcon,
  SidebarRightOpenIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import React, { useContext, useState } from "react";
import { useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderPerformance } from "@app/components/agent_builder/AgentBuilderPerformance";
import { AgentBuilderPreview } from "@app/components/agent_builder/AgentBuilderPreview";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import { ConfirmContext } from "@app/components/Confirm";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/templates/[tId]";

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
                {hasTemplate && (
                  <TabsTrigger
                    value="template"
                    label="Template"
                    icon={MagicIcon}
                    onClick={() => onTabChange("template")}
                  />
                )}
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
      {hasTemplate && (
        <Button
          icon={MagicIcon}
          variant="ghost"
          size="sm"
          tooltip="Template"
          onClick={() => onTabSelect("template")}
        />
      )}
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
  agentConfigurationSId?: string;
  assistantTemplate?: FetchAssistantTemplateResponse | null;
}

function ExpandedContent({
  selectedTab,
  agentConfigurationSId,
  assistantTemplate,
}: ExpandedContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedTab === "template" && assistantTemplate && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <TemplateButtons
              assistantTemplate={assistantTemplate}
            />
            {assistantTemplate.helpInstructions && (
              <>
                <Markdown content={assistantTemplate.helpInstructions} />
                {assistantTemplate.helpActions && (
                  <div className="h-px bg-border" />
                )}
              </>
            )}
            {assistantTemplate.helpActions && (
              <Markdown content={assistantTemplate.helpActions} />
            )}
          </div>
        </div>
      )}
      {selectedTab === "testing" && (
        <div className="min-h-0 flex-1">
          <AgentBuilderPreview />
        </div>
      )}
      {selectedTab === "performance" && agentConfigurationSId && (
        <div className="flex-1 overflow-y-auto p-4">
          <AgentBuilderPerformance
            agentConfigurationSId={agentConfigurationSId}
          />
        </div>
      )}
    </div>
  );
}

interface TemplateButtonsProps {
  assistantTemplate: FetchAssistantTemplateResponse;
}

function TemplateButtons({
  assistantTemplate,
}: TemplateButtonsProps) {
  const confirm = useContext(ConfirmContext);
  const { setValue, watch } = useFormContext<AgentBuilderFormData>();
  
  // Watch current form values
  const currentInstructions = watch("instructions");
  const currentActions = watch("actions");
  
  const instructionsChanged = currentInstructions !== assistantTemplate.presetInstructions;
  const hasActions = currentActions && currentActions.length > 0;
  
  const handleResetInstructions = async () => {
    const confirmed = await confirm({
      title: "Are you sure?",
      message:
        "You will lose the changes you have made to the agent's instructions and go back to the template's default settings.",
      validateVariant: "warning",
    });
    
    if (confirmed && assistantTemplate.presetInstructions) {
      setValue("instructions", assistantTemplate.presetInstructions);
    }
  };
  
  const handleResetActions = async () => {
    const confirmed = await confirm({
      title: "Are you sure?",
      message:
        "You will lose the changes you have made to the agent's tools.",
      validateVariant: "warning",
    });
    
    if (confirmed) {
      setValue("actions", []);
    }
  };
  
  return (
    <div className="flex items-center justify-end gap-2">
      {instructionsChanged && (
        <Button
          label="Reset instructions"
          onClick={handleResetInstructions}
          icon={ArrowPathIcon}
          size="sm"
          variant="outline"
        />
      )}
      {hasActions && (
        <Button
          label="Reset tools"
          onClick={handleResetActions}
          icon={ArrowPathIcon}
          size="sm"
          variant="outline"
        />
      )}
    </div>
  );
}


interface AgentBuilderRightPanelProps {
  agentConfigurationSId?: string;
  assistantTemplate?: FetchAssistantTemplateResponse | null;
}

export function AgentBuilderRightPanel({
  agentConfigurationSId,
  assistantTemplate,
}: AgentBuilderRightPanelProps) {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    usePreviewPanelContext();
  
  const hasTemplate = !!assistantTemplate;
  
  const [selectedTab, setSelectedTab] =
    useState<AgentBuilderRightPanelTabType>(
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
