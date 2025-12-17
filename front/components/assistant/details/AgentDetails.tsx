import {
  ArrowPathIcon,
  Avatar,
  BarChartIcon,
  BellIcon,
  BrainIcon,
  Button,
  Chip,
  ContentMessage,
  InformationCircleIcon,
  ListCheckIcon,
  LockIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useEffect, useState } from "react";

import { AgentDetailsButtonBar } from "@app/components/assistant/details/AgentDetailsButtonBar";
import { AgentEditorsTab } from "@app/components/assistant/details/tabs/AgentEditorsTab";
import { AgentInfoTab } from "@app/components/assistant/details/tabs/AgentInfoTab";
import { AgentInsightsTab } from "@app/components/assistant/details/tabs/AgentInsightsTab";
import { AgentMemoryTab } from "@app/components/assistant/details/tabs/AgentMemoryTab";
import { AgentPerformanceTab } from "@app/components/assistant/details/tabs/AgentPerformanceTab";
import { AgentTriggersTab } from "@app/components/assistant/details/tabs/AgentTriggersTab";
import { RestoreAgentDialog } from "@app/components/assistant/RestoreAgentDialog";
import { isMCPConfigurationForAgentMemory } from "@app/lib/actions/types/guards";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  AgentConfigurationScope,
  UserType,
  WorkspaceType,
} from "@app/types";
import { GLOBAL_AGENTS_SID, isAdmin } from "@app/types";

export const SCOPE_INFO: Record<
  AgentConfigurationScope,
  {
    shortLabel: string;
    label: string;
    color: "green" | "golden" | "blue" | "primary";
    icon?: typeof UserGroupIcon | undefined;
    text: string;
  }
> = {
  global: {
    shortLabel: "Default",
    label: "Default Agent",
    color: "primary",
    text: "Default agents provided by Dust.",
  },
  hidden: {
    shortLabel: "Not published",
    label: "Not published",
    color: "primary",
    text: "Hidden agents.",
  },
  visible: {
    shortLabel: "Published",
    label: "Published",
    color: "green",
    text: "Visible agents.",
  },
} as const;

type AgentDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  agentId: string | null;
  user: UserType;
};

export function AgentDetails({
  agentId,
  onClose,
  owner,
  user,
}: AgentDetailsProps) {
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const [selectedTab, setSelectedTab] = useState<
    | "info"
    | "insights"
    | "performance"
    | "editors"
    | "agent_memory"
    | "triggers"
  >("info");
  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationValidating,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
  });

  useEffect(() => {
    // Reset to info tab when we open/close the modal
    setSelectedTab("info");
  }, [agentId]);

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    agentConfiguration?.sId as GLOBAL_AGENTS_SID
  );

  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const showEditorsTabs = agentId != null && !isGlobalAgent;
  const showTriggersTabs =
    agentId != null &&
    !isGlobalAgent &&
    featureFlags.includes("hootl_subscriptions");
  const showAgentMemory = !!agentConfiguration?.actions.find(
    isMCPConfigurationForAgentMemory
  );

  const showPerformanceTabs =
    (agentConfiguration?.canEdit ?? isAdmin(owner)) &&
    agentId != null &&
    !isGlobalAgent;

  const showInsightsTabs =
    agentId != null &&
    (agentConfiguration?.canEdit ?? isAdmin(owner)) &&
    !isGlobalAgent;

  const DescriptionSection = () => {
    const lastAuthor = agentConfiguration?.lastAuthors?.[0];
    const editedDate =
      agentConfiguration?.versionCreatedAt &&
      new Date(agentConfiguration.versionCreatedAt).toLocaleDateString(
        "en-US",
        {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }
      );

    return (
      <div className="flex flex-col items-center gap-4 pt-4">
        <div className="relative flex items-center justify-center">
          <div className="relative flex flex-col items-center gap-2">
            <Avatar
              name="Agent avatar"
              visual={agentConfiguration?.pictureUrl}
              size="xl"
            />
            {agentConfiguration?.status === "active" && (
              <Chip
                size="mini"
                color={SCOPE_INFO[agentConfiguration.scope].color}
                icon={SCOPE_INFO[agentConfiguration.scope].icon ?? undefined}
                label={SCOPE_INFO[agentConfiguration.scope].label}
                className="absolute -bottom-3 shadow-sm"
              />
            )}
          </div>
        </div>

        {/* Title and edit info */}
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
            {agentConfiguration?.name ?? ""}
          </h2>
          {editedDate && (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Last edited: {editedDate}
              {lastAuthor && ` by ${lastAuthor}`}
            </p>
          )}
        </div>

        {agentConfiguration?.status === "active" && (
          <AgentDetailsButtonBar
            owner={owner}
            agentConfiguration={agentConfiguration}
            isAgentConfigurationValidating={isAgentConfigurationValidating}
          />
        )}

        {agentConfiguration?.status === "archived" && (
          <>
            <ContentMessage
              title="This agent has been archived."
              variant="warning"
              icon={InformationCircleIcon}
              size="sm"
            >
              It is no longer active and cannot be used.
              <br />
              <div className="mt-2">
                <Button
                  variant="outline"
                  label="Restore"
                  onClick={() => {
                    setShowRestoreModal(true);
                  }}
                  classname="mt-2"
                  icon={ArrowPathIcon}
                />
              </div>
            </ContentMessage>

            <RestoreAgentDialog
              owner={owner}
              isOpen={showRestoreModal}
              agentConfiguration={agentConfiguration}
              onClose={() => {
                setShowRestoreModal(false);
              }}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <Sheet open={!!agentId} onOpenChange={onClose}>
      <SheetContent size="lg">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        {isAgentConfigurationLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <SheetHeader className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
              {/* eslint-disable-next-line react-hooks/static-components */}
              <DescriptionSection />
            </SheetHeader>
            <SheetContainer className="pb-4">
              {showEditorsTabs ||
              showPerformanceTabs ||
              showAgentMemory ||
              showInsightsTabs ? (
                <Tabs value={selectedTab}>
                  <TabsList border={false}>
                    <TabsTrigger
                      value="info"
                      label="Info"
                      icon={InformationCircleIcon}
                      onClick={() => setSelectedTab("info")}
                    />
                    {showInsightsTabs && (
                      <TabsTrigger
                        value="insights"
                        label="Insights"
                        icon={BarChartIcon}
                        onClick={() => setSelectedTab("insights")}
                      />
                    )}
                    {showTriggersTabs && (
                      <TabsTrigger
                        value="triggers"
                        label="Triggers"
                        icon={BellIcon}
                        onClick={() => setSelectedTab("triggers")}
                      />
                    )}
                    {showPerformanceTabs && (
                      <TabsTrigger
                        value="performance"
                        label="Feedback"
                        icon={ListCheckIcon}
                        onClick={() => setSelectedTab("performance")}
                      />
                    )}
                    {showEditorsTabs && (
                      <TabsTrigger
                        value="editors"
                        label="Editors"
                        icon={UserGroupIcon}
                        onClick={() => setSelectedTab("editors")}
                      />
                    )}
                    {showAgentMemory && (
                      <TabsTrigger
                        value="agent_memory"
                        label="Memory"
                        icon={BrainIcon}
                        onClick={() => setSelectedTab("agent_memory")}
                      />
                    )}
                  </TabsList>
                  {agentConfiguration && (
                    <div className="mt-4">
                      <TabsContent value="info">
                        <AgentInfoTab
                          agentConfiguration={agentConfiguration}
                          owner={owner}
                        />
                      </TabsContent>
                      <TabsContent value="insights">
                        <AgentInsightsTab
                          owner={owner}
                          agentConfiguration={agentConfiguration}
                        />
                      </TabsContent>
                      <TabsContent value="triggers">
                        <AgentTriggersTab
                          agentConfiguration={agentConfiguration}
                          owner={owner}
                        />
                      </TabsContent>

                      <TabsContent value="performance">
                        <AgentPerformanceTab
                          agentConfiguration={agentConfiguration}
                          owner={owner}
                        />
                      </TabsContent>
                      <TabsContent value="editors">
                        <AgentEditorsTab
                          owner={owner}
                          user={user}
                          agentConfiguration={agentConfiguration}
                        />
                      </TabsContent>
                      <TabsContent value="agent_memory">
                        <AgentMemoryTab
                          owner={owner}
                          agentConfiguration={agentConfiguration}
                        />
                      </TabsContent>
                    </div>
                  )}
                </Tabs>
              ) : agentConfiguration ? (
                <AgentInfoTab
                  agentConfiguration={agentConfiguration}
                  owner={owner}
                />
              ) : (
                <div />
              )}
              {isAgentConfigurationError?.error.type ===
                "agent_configuration_not_found" && (
                <ContentMessage title="Not Available" icon={LockIcon} size="md">
                  This agent is not available.
                </ContentMessage>
              )}
            </SheetContainer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
