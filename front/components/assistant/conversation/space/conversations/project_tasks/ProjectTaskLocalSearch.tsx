import { useProjectTasksPanel } from "@app/components/assistant/conversation/space/conversations/project_tasks/ProjectTasksPanelContext";
import { useDebounce } from "@app/hooks/useDebounce";
import { SearchInput } from "@dust-tt/sparkle";
import { useEffect } from "react";

/** Keeps keystrokes out of panel context — only debounced updates reach the task tables. */
export function ProjectTaskLocalSearch() {
  const { setDebouncedTaskSearchQuery } = useProjectTasksPanel();

  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: 200,
  });

  useEffect(() => {
    setDebouncedTaskSearchQuery(debouncedValue);
  }, [debouncedValue, setDebouncedTaskSearchQuery]);

  return (
    <SearchInput
      name="project-tasks-filter"
      placeholder="Filter tasks..."
      value={inputValue}
      onChange={setValue}
      className="w-full"
    />
  );
}
