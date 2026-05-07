import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import type {
  ProjectTaskPeopleScope,
  ProjectTaskPeriodScope,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  Button,
  ClockIcon,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

const PERIOD_OPTIONS: Array<{
  value: ProjectTaskPeriodScope;
  label: string;
}> = [
  { value: "active", label: "Open" },
  { value: "last_24h", label: "Done today" },
  { value: "last_7d", label: "Done in the last 7 days" },
  { value: "last_30d", label: "Done in the last 30 days" },
];

const PEOPLE_OPTIONS: Array<{
  value: ProjectTaskPeopleScope;
  label: string;
  description: string;
}> = [
  {
    value: "just_mine",
    label: "Mine",
    description: "Your tasks only",
  },
  {
    value: "unassigned",
    label: "Unassigned",
    description: "Tasks with no assignee",
  },
  {
    value: "all_project",
    label: "Everyone",
    description: "All tasks in this project",
  },
];

export function ProjectTaskScopeFilter() {
  const isMobile = useIsMobile();
  const {
    isScopeMenuOpen,
    setIsScopeMenuOpen,
    taskOwnerFilter,
    onTaskOwnerFilterChange,
    taskScopeLabel,
  } = useProjectTasksPanel();

  return (
    <DropdownMenu
      modal={false}
      open={isScopeMenuOpen}
      onOpenChange={setIsScopeMenuOpen}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          isSelect
          label={isMobile ? undefined : taskScopeLabel}
          tooltip={isMobile ? taskScopeLabel : undefined}
          icon={ClockIcon}
          className={cn(!isMobile && "max-w-[min(100vw-3rem,24rem)]")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="start">
        <DropdownMenuLabel label="Status" />
        <DropdownMenuRadioGroup
          value={taskOwnerFilter.periodScope}
          className="mb-2"
        >
          {PERIOD_OPTIONS.map(({ value, label }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              label={label}
              onClick={() => {
                onTaskOwnerFilterChange({
                  ...taskOwnerFilter,
                  periodScope: value,
                });
              }}
            />
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel label="People" />
        <DropdownMenuRadioGroup value={taskOwnerFilter.peopleScope}>
          {PEOPLE_OPTIONS.map(({ value, label, description }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              label={label}
              description={description}
              onClick={() => {
                onTaskOwnerFilterChange({
                  ...taskOwnerFilter,
                  peopleScope: value,
                });
              }}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
