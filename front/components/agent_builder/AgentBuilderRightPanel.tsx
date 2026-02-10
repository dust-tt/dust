import {
  BarChartIcon,
  Button,
  ListCheckIcon,
  MagicIcon,
  RobotIcon,
  ScrollArea,
  SidebarRightCloseIcon,
  SidebarRightOpenIcon,
  Tabs,
  TabsList,
  TabsTrigger,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { AgentBuilderCopilot } from "@app/components/agent_builder/AgentBuilderCopilot";
import { AgentBuilderObservability } from "@app/components/agent_builder/AgentBuilderObservability";
import { AgentBuilderPerformance } from "@app/components/agent_builder/AgentBuilderPerformance";
import { AgentBuilderPreview } from "@app/components/agent_builder/AgentBuilderPreview";
import { AgentBuilderTemplate } from "@app/components/agent_builder/AgentBuilderTemplate";
import { ObservabilityProvider } from "@app/components/agent_builder/observability/ObservabilityContext";
import { EmptyPlaceholder } from "@app/components/agent_builder/observability/shared/EmptyPlaceholder";
import { TabContentLayout } from "@app/components/agent_builder/observability/TabContentLayout";
import { usePreviewPanelContext } from "@app/components/agent_builder/PreviewPanelContext";
import { useFeatureFlags } from "@app/lib/swr/workspaces";

type AgentBuilderRightPanelTabType =
  | "copilot"
  | "preview"
  | "feedback"
  | "template"
  | "insights";

interface PanelHeaderProps {
  isPreviewPanelOpen: boolean;
  selectedTab: AgentBuilderRightPanelTabType;
  onTogglePanel: () => void;
  onTabChange: (tab: AgentBuilderRightPanelTabType) => void;
  hasTemplate: boolean;
  hasCopilot: boolean;
}

function PanelHeader({
  isPreviewPanelOpen,
  selectedTab,
  onTogglePanel,
  onTabChange,
  hasTemplate,
  hasCopilot,
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
                {hasCopilot && (
                  <TabsTrigger
                    value="copilot"
                    label="Copilot"
                    icon={RobotIcon}
                    onClick={() => onTabChange("copilot")}
                  />
                )}
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
  hasCopilot: boolean;
}

function CollapsedTabs({
  onTabSelect,
  hasTemplate,
  hasCopilot,
}: CollapsedTabsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      {hasCopilot && (
        <Button
          icon={RobotIcon}
          variant="ghost"
          size="sm"
          tooltip="Copilot"
          onClick={() => onTabSelect("copilot")}
        />
      )}
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
  hasCopilot: boolean;
}

function ExpandedContent({
  selectedTab,
  agentConfigurationSId,
  hasCopilot,
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
      {selectedTab === "copilot" && hasCopilot && (
        <div className="min-h-0 flex-1">
          <AgentBuilderCopilot />
        </div>
      )}
      {selectedTab === "preview" && (
        <div className="min-h-0 flex-1">
          <AgentBuilderPreview />
        </div>
      )}
      <ObservabilityProvider>
        {selectedTab === "insights" &&
          (agentConfigurationSId ? (
            <AgentBuilderObservability
              agentConfigurationSId={agentConfigurationSId}
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
  conversationId?: string;
}

export function AgentBuilderRightPanel({
  agentConfigurationSId,
  conversationId,
}: AgentBuilderRightPanelProps) {
  const { isPreviewPanelOpen, setIsPreviewPanelOpen } =
    usePreviewPanelContext();
  const { assistantTemplate, owner } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });

  const hasTemplate = !!assistantTemplate;
  const hasCopilot = hasFeature("agent_builder_copilot");
  const inferFromConversation = conversationId && hasCopilot && !hasTemplate;

  const [selectedTab, setSelectedTab] = useState<AgentBuilderRightPanelTabType>(
    hasTemplate ? "template" : inferFromConversation ? "copilot" : "preview",
  );

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
          hasTemplate={hasTemplate}
          hasCopilot={hasCopilot}
        />
      </div>
      {isPreviewPanelOpen ? (
        <ExpandedContent
          selectedTab={selectedTab}
          agentConfigurationSId={agentConfigurationSId}
          hasCopilot={hasCopilot}
        />
      ) : (
        <CollapsedTabs
          onTabSelect={handleTabSelect}
          hasTemplate={hasTemplate}
          hasCopilot={hasCopilot}
        />
      )}
    </div>
  );
}
