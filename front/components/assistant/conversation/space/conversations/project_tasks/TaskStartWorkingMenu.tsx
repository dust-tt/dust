import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ProjectTaskType } from "@app/types/project_task";
import {
  Avatar,
  Button,
  ButtonGroup,
  ButtonGroupDropdown,
  CheckIcon,
  ChevronDownIcon,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Icon,
  PlayIcon,
  RobotIcon,
  TextArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  customMessage: z.string(),
  selectedAgent: z.custom<LightAgentConfigurationType | null>(),
  goToConversationAfterStart: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

function pickDefaultAgent(
  agents: LightAgentConfigurationType[]
): LightAgentConfigurationType | null {
  return (
    agents.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST) ?? agents[0] ?? null
  );
}

interface TaskStartWorkingMenuProps {
  task: ProjectTaskType;
  isStarting: boolean;
  isFirstOnboardingTask: boolean;
}

export function TaskStartWorkingMenu({
  task,
  isStarting,
  isFirstOnboardingTask,
}: TaskStartWorkingMenuProps) {
  const { owner, activeAgents, isAgentsLoading, handleStartWorking } =
    useProjectTasksPanel();

  const [open, setOpen] = useState(false);

  const buildDefaults = useCallback(
    (): FormValues => ({
      customMessage: "",
      selectedAgent: pickDefaultAgent(activeAgents),
      goToConversationAfterStart: !!task.agentInstructions?.trim(),
    }),
    [activeAgents, task.agentInstructions]
  );

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(),
  });

  useEffect(() => {
    if (open) {
      reset(buildDefaults());
    }
  }, [open, reset, buildDefaults]);

  const { field: customMessageField } = useController({
    control,
    name: "customMessage",
  });
  const { field: selectedAgentField } = useController({
    control,
    name: "selectedAgent",
  });
  const selectedAgent = selectedAgentField.value;
  const { field: goToConversationField } = useController({
    control,
    name: "goToConversationAfterStart",
  });

  const onSubmit = handleSubmit(async (values) => {
    setOpen(false);
    const agentConfigurationId =
      values.selectedAgent &&
      values.selectedAgent.sId !== GLOBAL_AGENTS_SID.DUST
        ? values.selectedAgent.sId
        : undefined;
    await handleStartWorking(task, {
      customMessage: values.customMessage.trim() || undefined,
      agentConfigurationId,
      goToConversation: values.goToConversationAfterStart,
    });
  });

  const keepActionsVisible = open || isFirstOnboardingTask || isStarting;

  const checkIcon = (
    <Icon
      size="xs"
      visual={CheckIcon}
      className="text-muted-foreground dark:text-muted-foreground-night"
    />
  );

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 transition-opacity",
        keepActionsVisible
          ? "opacity-100"
          : "opacity-100 md:opacity-0 md:group-hover/task:opacity-100 md:focus-within:opacity-100"
      )}
    >
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            icon={PlayIcon}
            size="xs"
            variant="outline"
            isLoading={isStarting}
            disabled={isStarting}
            isPulsing={isFirstOnboardingTask && !open}
            tooltip="Start working on task"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-96">
          <div className="flex flex-col gap-3 p-3">
            <TextArea
              id={`task-start-msg-${task.sId}`}
              aria-label="Additional instructions for the agent"
              placeholder="(optional) Add a custom message for the agent..."
              value={customMessageField.value}
              rows={4}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                customMessageField.onChange(event.target.value)
              }
            />
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <AgentPicker
                  owner={owner}
                  agents={activeAgents}
                  disabled={isAgentsLoading}
                  isLoading={isAgentsLoading}
                  mountPortal
                  showDropdownArrow
                  showFooterButtons={false}
                  side="bottom"
                  size="xs"
                  onItemClick={(agent) => selectedAgentField.onChange(agent)}
                  pickerButton={
                    <Button
                      variant="ghost-secondary"
                      size="xs"
                      isSelect
                      icon={
                        selectedAgent
                          ? () => (
                              <Avatar
                                size="xxs"
                                visual={selectedAgent.pictureUrl}
                              />
                            )
                          : RobotIcon
                      }
                      label={selectedAgent?.name ?? "Agent"}
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
                  disabled={isStarting || !selectedAgent}
                  onClick={() => void onSubmit()}
                />
                <ButtonGroupDropdown
                  align="end"
                  items={[
                    {
                      label: "Redirect to conversation",
                      onSelect: (e) => {
                        e.preventDefault();
                        goToConversationField.onChange(true);
                      },
                      endComponent: goToConversationField.value
                        ? checkIcon
                        : undefined,
                    },
                    {
                      label: "Stay on tasks",
                      onSelect: (e) => {
                        e.preventDefault();
                        goToConversationField.onChange(false);
                      },
                      endComponent: !goToConversationField.value
                        ? checkIcon
                        : undefined,
                    },
                  ]}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      icon={ChevronDownIcon}
                      disabled={isStarting || !selectedAgent}
                      aria-label="After start: open conversation or stay on tasks"
                    />
                  }
                />
              </ButtonGroup>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
