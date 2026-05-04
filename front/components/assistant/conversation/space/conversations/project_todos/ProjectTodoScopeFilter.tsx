import { useProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import type {
  ProjectTodoPeopleScope,
  ProjectTodoPeriodScope,
} from "@app/components/assistant/conversation/space/conversations/project_todos/projectTodosListScope";
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
  value: ProjectTodoPeriodScope;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "last_24h", label: "Last 24h" },
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
];

const PEOPLE_OPTIONS: Array<{
  value: ProjectTodoPeopleScope;
  label: string;
}> = [
  { value: "all_project", label: "All project's" },
  { value: "just_mine", label: "Just mine" },
];

export function ProjectTodoScopeFilter() {
  const isMobile = useIsMobile();
  const {
    isScopeMenuOpen,
    setIsScopeMenuOpen,
    todoOwnerFilter,
    onTodoOwnerFilterChange,
    todoScopeLabel,
  } = useProjectTodosPanel();

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
          label={isMobile ? undefined : todoScopeLabel}
          tooltip={isMobile ? todoScopeLabel : undefined}
          icon={ClockIcon}
          className={cn(!isMobile && "max-w-[min(100vw-3rem,24rem)]")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="z-[1000] w-80 shadow-2xl ring-1 ring-border/60"
        align="start"
      >
        <DropdownMenuLabel label="Historic" />
        <DropdownMenuRadioGroup
          value={todoOwnerFilter.periodScope}
          className="mb-2"
        >
          {PERIOD_OPTIONS.map(({ value, label }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              label={label}
              onClick={() => {
                onTodoOwnerFilterChange({
                  ...todoOwnerFilter,
                  periodScope: value,
                });
              }}
            />
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel label="People" />
        <DropdownMenuRadioGroup value={todoOwnerFilter.peopleScope}>
          {PEOPLE_OPTIONS.map(({ value, label }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              label={label}
              onClick={() => {
                onTodoOwnerFilterChange({
                  ...todoOwnerFilter,
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
