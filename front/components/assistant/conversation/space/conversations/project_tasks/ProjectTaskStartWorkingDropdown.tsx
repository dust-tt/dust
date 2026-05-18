import { AgentPicker } from "@app/components/assistant/AgentPicker";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  ButtonGroup,
  ButtonGroupDropdown,
  CheckIcon,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  type DropdownMenuItemProps,
  DropdownMenuTrigger,
  Icon,
  PlayIcon,
  RobotIcon,
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

export function ProjectTaskStartWorkingDropdown({
  owner,
  taskSId,
  activeAgents,
  agentsLoading,
  disabled,
  disabledReason,
  isStarting,
  isFirstOnboardingTask = false,
  defaultGoToConversation = false,
  onOpenChange,
  onStart,
  triggerClassName,
  /** Default `xs`. Use `icon-xs` for a compact icon-only trigger (e.g. inline in metadata). */
  triggerSize = "xs",
}: {
  owner: LightWorkspaceType;
  taskSId: string;
  activeAgents: LightAgentConfigurationType[];
  agentsLoading: boolean;
  disabled: boolean;
  disabledReason?: string;
  isStarting: boolean;
  isFirstOnboardingTask?: boolean;
  defaultGoToConversation?: boolean;
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

  const startRedirectMenuItems = useMemo((): DropdownMenuItemProps[] => {
    const check = (
      <Icon
        size="xs"
        visual={CheckIcon}
        className="text-muted-foreground dark:text-muted-foreground-night"
      />
    );
    return [
      {
        label: "Redirect to conversation",
        onSelect: (e: Event) => {
          e.preventDefault();
          setGoToConversationAfterStart(true);
        },
        endComponent: goToConversationAfterStart ? check : undefined,
      },
      {
        label: "Stay on tasks",
        onSelect: (e: Event) => {
          e.preventDefault();
          setGoToConversationAfterStart(false);
        },
        endComponent: !goToConversationAfterStart ? check : undefined,
      },
    ];
  }, [goToConversationAfterStart]);

  const triggerButton = disabled ? (
    <Tooltip
      label={
        disabledReason ?? "Can't start work on this task in this state yet."
      }
      trigger={
        <Button icon={PlayIcon} size={triggerSize} variant="outline" disabled />
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
          icon={PlayIcon}
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
            id={`task-start-msg-${taskSId}`}
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
                        : RobotIcon
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
                    icon={ChevronDownIcon}
                    disabled={isStarting || !selectedStartAgent}
                    aria-label="After start: open conversation or stay on tasks"
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
