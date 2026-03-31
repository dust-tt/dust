import type { AgentBuilderTriggerType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ScheduleEditionSheetContent } from "@app/components/agent_builder/triggers/schedule/ScheduleEditionSheet";
import { TriggerSelectionPageContent } from "@app/components/agent_builder/triggers/TriggerSelectionPage";
import type { SheetMode } from "@app/components/agent_builder/triggers/TriggerViewsSheet";
import { WebhookEditionSheetContent } from "@app/components/agent_builder/triggers/webhook/WebhookEditionSheet";
import { AgentDetailsButtonBar } from "@app/components/assistant/details/AgentDetailsButtonBar";
import { AgentEditorsTab } from "@app/components/assistant/details/tabs/AgentEditorsTab";
import { AgentInfoTab } from "@app/components/assistant/details/tabs/AgentInfoTab";
import { AgentInsightsTab } from "@app/components/assistant/details/tabs/AgentInsightsTab";
import { AgentMemoryTab } from "@app/components/assistant/details/tabs/AgentMemoryTab";
import { AgentTriggersTab } from "@app/components/assistant/details/tabs/AgentTriggersTab";
import { useTriggerSheetState } from "@app/components/assistant/details/useTriggerSheetState";
import { RestoreAgentDialog } from "@app/components/assistant/RestoreAgentDialog";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { isServerSideMCPServerConfigurationWithName } from "@app/lib/actions/types/guards";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/api/actions/servers/agent_memory/metadata";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useSpaces } from "@app/lib/swr/spaces";
import { useWebhookSourceViewsFromSpaces } from "@app/lib/swr/webhook_source";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { TriggerType } from "@app/types/assistant/triggers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type { UserType, WorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  Avatar,
  BarChartIcon,
  BellIcon,
  BrainIcon,
  Button,
  Chip,
  ContentMessage,
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
import { useCallback, useEffect, useState } from "react";

function triggerTypeToBuilderType(
  trigger: TriggerType
): AgentBuilderTriggerType {
  switch (trigger.kind) {
    case "schedule":
      return {
        sId: trigger.sId,
        status: trigger.status,
        name: trigger.name,
        kind: "schedule",
        customPrompt: trigger.customPrompt,
        naturalLanguageDescription: trigger.naturalLanguageDescription,
        configuration: trigger.configuration,
        editor: trigger.editor,
      };
    case "webhook":
      return {
        sId: trigger.sId,
        status: trigger.status,
        name: trigger.name,
        kind: "webhook",
        customPrompt: trigger.customPrompt,
        naturalLanguageDescription: trigger.naturalLanguageDescription,
        configuration: trigger.configuration,
        editor: trigger.editor,
        webhookSourceViewSId: trigger.webhookSourceViewSId,
        executionPerDayLimitOverride: trigger.executionPerDayLimitOverride,
        executionMode: trigger.executionMode,
      };
    default:
      assertNever(trigger);
  }
}

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

type AgentDetailsSheetProps = {
  owner: WorkspaceType;
  onClose: () => void;
  agentId: string | null;
  user: UserType;
};

export function AgentDetailsSheet({
  agentId,
  onClose,
  owner,
  user,
}: AgentDetailsSheetProps) {
  const [selectedTab, setSelectedTab] = useState<
    "info" | "insights" | "editors" | "agent_memory" | "triggers"
  >("info");
  const [triggerEditMode, setTriggerEditMode] = useState<SheetMode | null>(
    null
  );

  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationValidating,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
  });

  // Fetch webhook source views when triggers tab is active so they're ready
  // when the user clicks edit on a webhook trigger.
  const isTriggersTabActive = selectedTab === "triggers" && !!agentId;

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
    disabled: !isTriggersTabActive,
  });

  const { webhookSourceViews } = useWebhookSourceViewsFromSpaces(
    owner,
    spaces,
    !isTriggersTabActive
  );

  const handleAddTrigger = useCallback(() => {
    setTriggerEditMode({ type: "add" });
  }, []);

  const handleEditTrigger = useCallback(
    (trigger: TriggerType) => {
      const builderTrigger = triggerTypeToBuilderType(trigger);
      const wsv =
        trigger.kind === "webhook" && trigger.webhookSourceViewSId
          ? (webhookSourceViews.find(
              (v) => v.sId === trigger.webhookSourceViewSId
            ) ?? null)
          : null;
      setTriggerEditMode({
        type: "edit",
        trigger: builderTrigger,
        webhookSourceView: wsv,
      });
    },
    [webhookSourceViews]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    // Reset to info tab and close trigger editing when we open/close the modal
    setSelectedTab("info");
    setTriggerEditMode(null);
  }, [agentId]);

  const isGlobalAgent = Object.values(GLOBAL_AGENTS_SID).includes(
    agentConfiguration?.sId as GLOBAL_AGENTS_SID
  );

  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const showEditorsTabs =
    agentId != null &&
    !isGlobalAgent &&
    agentConfiguration?.status === "active";
  const showTriggersTabs =
    agentId != null && agentConfiguration?.status === "active";
  const showAgentMemory = !!agentConfiguration?.actions.find((arg) =>
    isServerSideMCPServerConfigurationWithName(arg, AGENT_MEMORY_SERVER_NAME)
  );

  const showInsightsTabs =
    agentId != null && (isBuilder(owner) || agentConfiguration?.canEdit);

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
                  className="mt-2"
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
      <SheetContent size="xl" className="outline-none">
        <VisuallyHidden>
          <SheetTitle />
        </VisuallyHidden>
        {isAgentConfigurationLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : triggerEditMode && agentConfiguration ? (
          <TriggerEditView
            owner={owner}
            agentConfigurationId={agentConfiguration.sId}
            mode={triggerEditMode}
            webhookSourceViews={webhookSourceViews}
            onClose={() => setTriggerEditMode(null)}
          />
        ) : (
          <>
            <SheetHeader className="flex flex-col gap-5 text-sm text-foreground dark:text-foreground-night">
              {/* eslint-disable-next-line react-hooks/static-components */}
              <DescriptionSection />
            </SheetHeader>
            <SheetContainer className="pb-4">
              {showEditorsTabs ||
              showAgentMemory ||
              showInsightsTabs ||
              showTriggersTabs ? (
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
                          onEditTrigger={handleEditTrigger}
                          onAddTrigger={handleAddTrigger}
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

interface TriggerEditViewProps {
  owner: WorkspaceType;
  agentConfigurationId: string;
  mode: SheetMode;
  webhookSourceViews: WebhookSourceViewType[];
  onClose: () => void;
}

function TriggerEditView({
  owner,
  agentConfigurationId,
  mode,
  webhookSourceViews,
  onClose,
}: TriggerEditViewProps) {
  const {
    form,
    currentPageId,
    webhookSourceView,
    editTrigger,
    isEditor,
    isOnSelectionPage,
    pageTitle,
    handleScheduleSelect,
    handleWebhookSelect,
    handleCancel,
    handleFormSubmit,
  } = useTriggerSheetState({
    owner,
    agentConfigurationId,
    mode,
    webhookSourceViews,
    onSuccess: onClose,
  });

  return (
    <FormProvider form={form} asForm={false}>
      <div className="flex flex-row items-center gap-2 p-5 text-sm text-foreground dark:text-foreground-night">
        <Button
          icon={ArrowLeftIcon}
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!isOnSelectionPage && mode.type !== "edit") {
              handleCancel();
            } else {
              onClose();
            }
          }}
        />
        <h2 className="text-lg font-semibold">{pageTitle}</h2>
      </div>
      <SheetContainer>
        {currentPageId === "trigger-selection" && (
          <TriggerSelectionPageContent
            onScheduleSelect={handleScheduleSelect}
            onWebhookSelect={handleWebhookSelect}
            webhookSourceViews={webhookSourceViews}
          />
        )}
        {currentPageId === "schedule-edition" && (
          <ScheduleEditionSheetContent
            owner={owner}
            trigger={editTrigger?.kind === "schedule" ? editTrigger : null}
            isEditor={isEditor}
          />
        )}
        {currentPageId === "webhook-edition" && (
          <WebhookEditionSheetContent
            owner={owner}
            trigger={editTrigger?.kind === "webhook" ? editTrigger : null}
            agentConfigurationId={agentConfigurationId}
            webhookSourceView={webhookSourceView}
            isEditor={isEditor}
          />
        )}
      </SheetContainer>
      {!isOnSelectionPage && (
        <div className="flex flex-none justify-end gap-2 border-t border-border p-3 dark:border-border-night">
          <Button
            label="Cancel"
            variant="outline"
            onClick={() => {
              handleCancel();
              onClose();
            }}
          />
          <Button
            label="Save"
            variant="primary"
            onClick={form.handleSubmit(handleFormSubmit)}
          />
        </div>
      )}
    </FormProvider>
  );
}
