import {
  peopleScopeLabel,
  periodScopeLabel,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/projectTasksListScope";
import { usePodTasksPanel } from "@app/components/pod/tasks/PodTasksPanelContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  isPodTaskPeopleScope,
  isPodTaskPeriodScope,
  POD_TASK_PEOPLE_SCOPES,
  POD_TASK_PERIOD_SCOPES,
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
  EyeV2,
} from "@dust-tt/sparkle";

export function PodTaskScopeFilter() {
  const { taskOwnerFilter, onTaskOwnerFilterChange } = usePodTasksPanel();
  const isMobile = useIsMobile();
  const periodLabel = periodScopeLabel(taskOwnerFilter.periodScope);

  return (
    <div className="flex items-center gap-2">
      <ButtonsSwitchList
        size="xs"
        defaultValue={taskOwnerFilter.peopleScope}
        onValueChange={(value) => {
          if (isPodTaskPeopleScope(value)) {
            onTaskOwnerFilterChange({
              ...taskOwnerFilter,
              peopleScope: value,
            });
          }
        }}
      >
        {POD_TASK_PEOPLE_SCOPES.map((scope) => (
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
            icon={EyeV2}
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
              if (isPodTaskPeriodScope(value)) {
                onTaskOwnerFilterChange({
                  ...taskOwnerFilter,
                  periodScope: value,
                });
              }
            }}
          >
            {POD_TASK_PERIOD_SCOPES.map((scope) => (
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
