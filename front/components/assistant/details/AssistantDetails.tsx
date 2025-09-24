import {
  ArrowPathIcon,
  Avatar,
  BarChartIcon,
  BellIcon,
  Button,
  Chip,
  ContentMessage,
  DustIcon,
  InformationCircleIcon,
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
import { BrainIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AssistantDetailsButtonBar } from "@app/components/assistant/details/AssistantDetailsButtonBar";
import { AgentEditorsTab } from "@app/components/assistant/details/tabs/AgentEditorsTab";
import { AgentInfoTab } from "@app/components/assistant/details/tabs/AgentInfoTab";
import { AgentMemoryTab } from "@app/components/assistant/details/tabs/AgentMemoryTab";
import { AgentPerformanceTab } from "@app/components/assistant/details/tabs/AgentPerformanceTab";
import { AgentTriggersTab } from "@app/components/assistant/details/tabs/AgentTriggersTab";
import { RestoreAssistantDialog } from "@app/components/assistant/RestoreAssistantDialog";
import { isMCPConfigurationForAgentMemory } from "@app/lib/actions/types/guards";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { AgentConfigurationScope, UserType, WorkspaceType } from "@app/types";
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
    icon: DustIcon,
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

type AssistantDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  assistantId: string | null;
  user: UserType;
};

export function AssistantDetails({
  assistantId,
  onClose,
  owner,
  user,
}: AssistantDetailsProps) {
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const [selectedTab, setSelectedTab] = useState<
    "info" | "performance" | "editors" | "agent_memory" | "triggers"
  >("info");
  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationValidating,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: assistantId,
  });

  useEffect(() => {
    // Reset to info tab when we open/close the modal
    setSelectedTab("info");
  }, [assistantId]);

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    agentConfiguration?.sId as GLOBAL_AGENTS_SID
  );

  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const showEditorsTabs = assistantId != null && !isGlobalAgent;
  const showTriggersTabs =
    assistantId != null &&
    !isGlobalAgent &&
    featureFlags.includes("hootl_subscriptions");
  const showAgentMemory = !!agentConfiguration?.actions.find(
    isMCPConfigurationForAgentMemory
  );

  const showPerformanceTabs =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    (agentConfiguration?.canEdit || isAdmin(owner)) &&
    assistantId != null &&
    !isGlobalAgent;

  const DescriptionSection = () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Avatar
          name="Agent avatar"
          visual={agentConfiguration?.pictureUrl}
          size="lg"
        />
        <div className="flex grow flex-col gap-1">
          <div className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">{`${agentConfiguration?.name ?? ""}`}</div>
          {agentConfiguration?.status === "active" && (
            <div>
              <Chip
                color={SCOPE_INFO[agentConfiguration.scope].color}
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                icon={SCOPE_INFO[agentConfiguration.scope].icon || undefined}
              >
                {SCOPE_INFO[agentConfiguration.scope].label}
              </Chip>
            </div>
          )}
        </div>
      </div>
      {agentConfiguration?.status === "active" && (
        <AssistantDetailsButtonBar
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

          <RestoreAssistantDialog
            owner={owner}
            isOpen={showRestoreModal}
            agentConfiguration={agentConfiguration}
            onClose={() => {
              setShowRestoreModal(false);
            }}
          />

          <div className="flex justify-center"></div>
        </>
      )}
    </div>
  );

  return (
    <Sheet open={!!assistantId} onOpenChange={onClose}>
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
              <DescriptionSection />
            </SheetHeader>
            <SheetContainer className="pb-4">
              {showEditorsTabs || showPerformanceTabs ? (
                <Tabs value={selectedTab}>
                  <TabsList border={false}>
                    <TabsTrigger
                      value="info"
                      label="Info"
                      icon={InformationCircleIcon}
                      onClick={() => setSelectedTab("info")}
                    />
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
                        label="Performance"
                        icon={BarChartIcon}
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
                          gridMode={false}
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
