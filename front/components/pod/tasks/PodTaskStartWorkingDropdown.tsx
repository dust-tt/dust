import { AgentPicker } from "@app/components/assistant/AgentPicker";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  ButtonGroup,
  ButtonGroupDropdown,
  CheckV2,
  ChevronDownV2,
  DropdownMenu,
  DropdownMenuContent,
  type DropdownMenuItemProps,
  DropdownMenuTrigger,
  Icon,
  PlayV2,
  RobotV2,
  TextArea,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

export type ProjectTaskStartWorkingOptions = {
  customMessage?: string;
  agentConfigurationId?: string;
  goToConversation: boolean;
};

export type ProjectTaskStartWorkingContext = "tasks_page" | "conversation";

function startRedirectMenuLabels(context: ProjectTaskStartWorkingContext): {
  goToConversation: string;
  stay: string;
  ariaLabel: string;
} {
  switch (context) {
    case "conversation":
      return {
        goToConversation: "Open task conversation",
        stay: "Stay in this conversation",
        ariaLabel: "After start: open task conversation or stay here",
      };
    case "tasks_page":
      return {
        goToConversation: "Redirect to conversation",
        stay: "Stay on tasks",
        ariaLabel: "After start: open conversation or stay on tasks",
      };
    default:
      assertNeverAndIgnore(context);
      return {
        goToConversation: "Redirect to conversation",
        stay: "Stay on tasks",
        ariaLabel: "After start: open conversation or stay on tasks",
      };
  }
}

export function PodTaskStartWorkingDropdown({
  owner,
  taskId,
  activeAgents,
  agentsLoading,
  disabled,
  disabledReason,
  isStarting,
  isFirstOnboardingTask = false,
  defaultGoToConversation = false,
  context = "tasks_page",
  onOpenChange,
  onStart,
  triggerClassName,
  /** Default `xs`. Use `icon-xs` for a compact icon-only trigger (e.g. inline in metadata). */
  triggerSize = "xs",
}: {
  owner: LightWorkspaceType;
  taskId: string;
  activeAgents: LightAgentConfigurationType[];
  agentsLoading: boolean;
  disabled: boolean;
  disabledReason?: string;
  isStarting: boolean;
  isFirstOnboardingTask?: boolean;
  defaultGoToConversation?: boolean;
  context?: ProjectTaskStartWorkingContext;
  onOpenChange?: (open: boolean) => void;
  onStart: (options: ProjectTaskStartWorkingOptions) => Promise<void>;
  triggerClassName?: string;
  triggerSize?: "xs" | "icon-xs";
}) {
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [startCustomMessage, setStartCustomMessage] = useState("");
  const [goToConversationAfterStart, setGoToConversationAfterStart] = useState(
    defaultGoToConversation
  );
  const [selectedStartAgent, setSelectedStartAgent] =
    useState<LightAgentConfigurationType | null>(null);

  useEffect(() => {
    setGoToConversationAfterStart(defaultGoToConversation);
  }, [defaultGoToConversation]);

  const handleStartMenuOpenChange = (open: boolean) => {
    setStartMenuOpen(open);
    onOpenChange?.(open);
    if (open) {
      setStartCustomMessage("");
      const defaultAgent =
        activeAgents.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST) ??
        activeAgents[0] ??
        null;
      setSelectedStartAgent(defaultAgent);
    }
  };

  const handleDirectStart = async () => {
    await onStart({
      customMessage: undefined,
      agentConfigurationId: undefined,
      goToConversation: true,
    });
  };

  const handleConfirmStart = async () => {
    setStartMenuOpen(false);
    onOpenChange?.(false);
    const agentConfigurationId =
      selectedStartAgent && selectedStartAgent.sId !== GLOBAL_AGENTS_SID.DUST
        ? selectedStartAgent.sId
        : undefined;
    await onStart({
      customMessage: startCustomMessage.trim() || undefined,
      agentConfigurationId,
      goToConversation: goToConversationAfterStart,
    });
  };

  const redirectMenuLabels = startRedirectMenuLabels(context);

  const startRedirectMenuItems = useMemo((): DropdownMenuItemProps[] => {
    const check = (
      <Icon
        size="xs"
        visual={CheckV2}
        className="text-muted-foreground dark:text-muted-foreground-night"
      />
    );
    return [
      {
        label: redirectMenuLabels.goToConversation,
        onSelect: (e: Event) => {
          e.preventDefault();
          setGoToConversationAfterStart(true);
        },
        endComponent: goToConversationAfterStart ? check : undefined,
      },
      {
        label: redirectMenuLabels.stay,
        onSelect: (e: Event) => {
          e.preventDefault();
          setGoToConversationAfterStart(false);
        },
        endComponent: !goToConversationAfterStart ? check : undefined,
      },
    ];
  }, [
    goToConversationAfterStart,
    redirectMenuLabels.goToConversation,
    redirectMenuLabels.stay,
  ]);

  if (isFirstOnboardingTask && !disabled) {
    return (
      <Button
        icon={PlayV2}
        size={triggerSize}
        variant="outline"
        className={triggerClassName}
        isLoading={isStarting}
        disabled={isStarting}
        isPulsing={!isStarting}
        tooltip="Start working on task"
        onClick={() => void handleDirectStart()}
      />
    );
  }

  const triggerButton = disabled ? (
    <Tooltip
      label={
        disabledReason ?? "Can't start work on this task in this state yet."
      }
      trigger={
        <Button icon={PlayV2} size={triggerSize} variant="outline" disabled />
      }
    />
  ) : (
    <DropdownMenu
      modal={false}
      open={startMenuOpen}
      onOpenChange={handleStartMenuOpenChange}
    >
      <DropdownMenuTrigger asChild>
        <Button
          icon={PlayV2}
          size={triggerSize}
          variant="outline"
          className={triggerClassName}
          isLoading={isStarting}
          disabled={isStarting}
          isPulsing={isFirstOnboardingTask && !startMenuOpen}
          tooltip="Start working on task"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="flex flex-col gap-3 p-3">
          <TextArea
            id={`task-start-msg-${taskId}`}
            aria-label="Additional instructions for the agent"
            placeholder="(optional) Add a custom message for the agent..."
            value={startCustomMessage}
            rows={4}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setStartCustomMessage(event.target.value)
            }
          />
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <AgentPicker
                owner={owner}
                agents={activeAgents}
                disabled={agentsLoading}
                isLoading={agentsLoading}
                mountPortal
                showDropdownArrow
                showFooterButtons={false}
                side="bottom"
                size="xs"
                onItemClick={(agent) => setSelectedStartAgent(agent)}
                pickerButton={
                  <Button
                    variant="ghost-secondary"
                    size="xs"
                    isSelect
                    icon={
                      selectedStartAgent
                        ? () => (
                            <Avatar
                              size="xxs"
                              visual={selectedStartAgent.pictureUrl}
                            />
                          )
                        : RobotV2
                    }
                    label={selectedStartAgent?.name ?? "Agent"}
                    className="max-w-full min-w-0"
                  />
                }
              />
            </div>
            <ButtonGroup className="shrink-0">
              <Button
                label="Start working"
                variant="outline"
                size="sm"
                className={isFirstOnboardingTask ? "z-10" : ""}
                isLoading={isStarting}
                isPulsing={isFirstOnboardingTask}
                disabled={isStarting || !selectedStartAgent}
                onClick={() => void handleConfirmStart()}
              />
              <ButtonGroupDropdown
                align="end"
                items={startRedirectMenuItems}
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    icon={ChevronDownV2}
                    disabled={isStarting || !selectedStartAgent}
                    aria-label={redirectMenuLabels.ariaLabel}
                  />
                }
              />
            </ButtonGroup>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return triggerButton;
}
