import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import {
  peopleScopeLabel,
  periodScopeLabel,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  isProjectTaskPeopleScope,
  isProjectTaskPeriodScope,
  PROJECT_TASK_PEOPLE_SCOPES,
  PROJECT_TASK_PERIOD_SCOPES,
} from "@app/types/project_task";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  EyeIcon,
} from "@dust-tt/sparkle";

export function ProjectTaskScopeFilter() {
  const { taskOwnerFilter, onTaskOwnerFilterChange } = useProjectTasksPanel();
  const isMobile = useIsMobile();
  const periodLabel = periodScopeLabel(taskOwnerFilter.periodScope);

  return (
    <div className="flex items-center gap-2">
      <ButtonsSwitchList
        size="xs"
        defaultValue={taskOwnerFilter.peopleScope}
        onValueChange={(value) => {
          if (isProjectTaskPeopleScope(value)) {
            onTaskOwnerFilterChange({
              ...taskOwnerFilter,
              peopleScope: value,
            });
          }
        }}
      >
        {PROJECT_TASK_PEOPLE_SCOPES.map((scope) => (
          <ButtonsSwitch
            key={scope}
            value={scope}
            label={peopleScopeLabel(scope)}
          />
        ))}
      </ButtonsSwitchList>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={EyeIcon}
            isSelect
            label={isMobile ? undefined : periodLabel}
            tooltip={isMobile ? periodLabel : undefined}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Status
          </div>
          <DropdownMenuRadioGroup
            value={taskOwnerFilter.periodScope}
            onValueChange={(value) => {
              if (isProjectTaskPeriodScope(value)) {
                onTaskOwnerFilterChange({
                  ...taskOwnerFilter,
                  periodScope: value,
                });
              }
            }}
          >
            {PROJECT_TASK_PERIOD_SCOPES.map((scope) => (
              <DropdownMenuRadioItem
                key={scope}
                value={scope}
                label={periodScopeLabel(scope)}
              />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
